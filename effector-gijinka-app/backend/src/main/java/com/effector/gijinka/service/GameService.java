package com.effector.gijinka.service;

import com.effector.gijinka.catalog.Catalog;
import com.effector.gijinka.catalog.CharacterDef;
import com.effector.gijinka.config.GameConfig;
import com.effector.gijinka.dto.Dtos;
import com.effector.gijinka.model.OwnedCharacter;
import com.effector.gijinka.model.OwnedCharacterRepository;
import com.effector.gijinka.model.PlayerState;
import com.effector.gijinka.model.PlayerStateRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ThreadLocalRandom;
import java.util.stream.Collectors;

@Service
public class GameService {

    /** MVPは固定ユーザー1人。将来は認証したユーザーIDに差し替える。 */
    public static final String PLAYER_ID = "default";

    private final PlayerStateRepository playerRepo;
    private final OwnedCharacterRepository ownedRepo;

    public GameService(PlayerStateRepository playerRepo, OwnedCharacterRepository ownedRepo) {
        this.playerRepo = playerRepo;
        this.ownedRepo = ownedRepo;
    }

    // ---- player 取得/生成 ----
    private PlayerState getOrCreate() {
        return playerRepo.findById(PLAYER_ID).orElseGet(() -> {
            PlayerState p = new PlayerState();
            p.setId(PLAYER_ID);
            p.setInitialized(false);
            p.setSenseParam(GameConfig.SENSE_START);
            p.setMoney(0);
            p.setCurrentWeek(0);
            p.setFreeGachaRemaining(0);
            p.setFormationCsv("");
            p.setLastSaveMillis(System.currentTimeMillis());
            return playerRepo.save(p);
        });
    }

    private List<OwnedCharacter> owned() {
        return ownedRepo.findByPlayerId(PLAYER_ID);
    }

    // ---- 進行の確定(オフライン進行 + オンライン進行 共通) ----
    /**
     * lastSaveMillis からの経過時間ぶん、各キャラの技術パラメーターを一括加算し、
     * lastSaveMillis を現在時刻に更新して保存する。
     * オンライン(頻繁なstate取得=小さな経過)とオフライン(長い経過)で同じ処理。
     */
    private void settleProgression(PlayerState p, List<OwnedCharacter> chars) {
        long now = System.currentTimeMillis();
        long elapsedMs = now - p.getLastSaveMillis();
        if (elapsedMs < 0) elapsedMs = 0;
        double elapsedSec = elapsedMs / 1000.0;
        if (GameConfig.OFFLINE_MAX_ELAPSED_SEC > 0) {
            elapsedSec = Math.min(elapsedSec, GameConfig.OFFLINE_MAX_ELAPSED_SEC);
        }
        if (elapsedSec > 0 && !chars.isEmpty()) {
            for (OwnedCharacter c : chars) {
                c.setTechParam(ProgressionCalculator.advance(c.getTechParam(), elapsedSec));
            }
            ownedRepo.saveAll(chars);
        }
        p.setLastSaveMillis(now);
        playerRepo.save(p);
    }

    // ---- DTO 構築 ----
    private Dtos.ConfigDto configDto() {
        return new Dtos.ConfigDto(
                GameConfig.BASE_RATE_PER_SEC,
                GameConfig.SOFT_CAP,
                GameConfig.HARD_CAP,
                GameConfig.SOFT_CAP_SLOW_FACTOR,
                GameConfig.GACHA_PAID_COST,
                GameConfig.GACHA_FREE_PER_WEEK,
                GameConfig.FORMATION_MIN,
                GameConfig.FORMATION_MAX,
                GameConfig.REINCARNATE_REQUIRED_MAXED,
                GameConfig.SENSE_MAX,
                GameConfig.SENSE_GAIN_PER_REINCARNATE
        );
    }

    private List<String> formationList(PlayerState p) {
        String csv = p.getFormationCsv();
        if (csv == null || csv.isBlank()) return List.of();
        return Arrays.stream(csv.split(",")).filter(s -> !s.isBlank()).collect(Collectors.toList());
    }

    private Dtos.StateDto buildState(PlayerState p, List<OwnedCharacter> chars) {
        List<Dtos.OwnedCharDto> ownedDtos = chars.stream()
                .map(c -> new Dtos.OwnedCharDto(c.getCharacterId(), c.getTechParam(),
                        ProgressionCalculator.isMaxed(c.getTechParam())))
                .collect(Collectors.toList());
        int maxedCount = (int) chars.stream().filter(c -> ProgressionCalculator.isMaxed(c.getTechParam())).count();
        boolean canReincarnate = maxedCount >= GameConfig.REINCARNATE_REQUIRED_MAXED;
        return new Dtos.StateDto(
                p.isInitialized(),
                p.getInitialMaker(),
                p.getSenseParam(),
                p.getMoney(),
                p.getCurrentWeek(),
                p.getFreeGachaRemaining(),
                formationList(p),
                ownedDtos,
                System.currentTimeMillis(),
                canReincarnate,
                maxedCount,
                configDto()
        );
    }

    // ---- API: 状態取得(進行を確定してから返す) ----
    @Transactional
    public Dtos.StateDto getState() {
        PlayerState p = getOrCreate();
        List<OwnedCharacter> chars = owned();
        settleProgression(p, chars);
        return buildState(p, chars);
    }

    public Dtos.ConfigDto getConfig() {
        return configDto();
    }

    // ---- API: 初期化(スターター入手) ----
    @Transactional
    public Dtos.StateDto init(Dtos.InitRequest req) {
        PlayerState p = getOrCreate();
        if (p.isInitialized()) {
            throw new IllegalStateException("すでに開始済みです。リセットしてからやり直してください。");
        }
        if (req.maker() == null || !Catalog.hasMaker(req.maker())) {
            throw new IllegalArgumentException("メーカー指定が不正です: " + req.maker());
        }
        String starterId;
        String method = req.method() == null ? "" : req.method();
        if (method.equals("od")) {
            CharacterDef def = Catalog.character(req.characterId());
            if (def == null || !def.makerId().equals(req.maker()) || !def.effectTypeId().equals("od")) {
                throw new IllegalArgumentException("選択メーカーのODではありません: " + req.characterId());
            }
            starterId = def.id();
        } else if (method.equals("gacha")) {
            starterId = rollFromPool(new HashSet<>()); // 全カタログから1つ
        } else {
            throw new IllegalArgumentException("入手方法が不正です(od / gacha): " + method);
        }

        long now = System.currentTimeMillis();
        p.setInitialized(true);
        p.setInitialMaker(req.maker());
        p.setSenseParam(GameConfig.SENSE_START);
        p.setMoney(GameConfig.START_MONEY);
        p.setCurrentWeek(1);
        p.setFreeGachaRemaining(GameConfig.GACHA_FREE_PER_WEEK);
        p.setLastSaveMillis(now);
        p.setFormationCsv(starterId);
        playerRepo.save(p);

        ownedRepo.save(new OwnedCharacter(PLAYER_ID, starterId, 0.0, now));
        return buildState(p, owned());
    }

    // ---- API: 編成変更 ----
    @Transactional
    public Dtos.StateDto setFormation(Dtos.FormationRequest req) {
        PlayerState p = getOrCreate();
        List<OwnedCharacter> chars = owned();
        settleProgression(p, chars);

        List<String> ids = req.characterIds() == null ? List.of() : req.characterIds();
        Set<String> ownedIds = chars.stream().map(OwnedCharacter::getCharacterId).collect(Collectors.toSet());
        List<String> cleaned = new ArrayList<>();
        for (String id : ids) {
            if (ownedIds.contains(id) && !cleaned.contains(id)) cleaned.add(id);
        }
        if (cleaned.size() > GameConfig.FORMATION_MAX) {
            throw new IllegalArgumentException("編成は最大 " + GameConfig.FORMATION_MAX + " 体までです。");
        }
        p.setFormationCsv(String.join(",", cleaned));
        playerRepo.save(p);
        return buildState(p, chars);
    }

    // ---- API: 週次ライブ ----
    @Transactional
    public Dtos.LiveResultDto runLive() {
        PlayerState p = getOrCreate();
        List<OwnedCharacter> chars = owned();
        settleProgression(p, chars);

        List<String> formation = formationList(p);
        if (formation.size() < GameConfig.FORMATION_MIN) {
            throw new IllegalStateException("編成が空です。最低 " + GameConfig.FORMATION_MIN + " 体を編成してください。");
        }

        // 技術参照
        var techById = chars.stream().collect(Collectors.toMap(OwnedCharacter::getCharacterId, OwnedCharacter::getTechParam, (a, b) -> a));
        double sense = p.getSenseParam();

        List<Dtos.LiveBreakdownDto> breakdown = new ArrayList<>();
        double sum = 0;
        Set<String> makers = new HashSet<>();
        for (String cid : formation) {
            CharacterDef def = Catalog.character(cid);
            if (def == null) continue;
            double tech = techById.getOrDefault(cid, 0.0);
            int flat = def.uniqueEffectFlat();
            double score = tech * sense + flat; // 技術 × センス + 固有効果
            sum += score;
            makers.add(def.makerId());
            breakdown.add(new Dtos.LiveBreakdownDto(cid, tech, flat, score));
        }

        double bonus = 1.0;
        String bonusLabel = "ボーナスなし";
        if (makers.size() == 1) {
            bonus = GameConfig.BONUS_SAME_MAKER;
            bonusLabel = "統一感ボーナス(同一メーカー統一)";
        } else if (makers.size() >= 2 && allFriendly(makers)) {
            bonus = GameConfig.BONUS_FRIENDLY_MIX;
            bonusLabel = "関係性ボーナス(友好メーカー混成)";
        }

        double totalScore = sum * bonus;
        long attendance = Math.round(totalScore * GameConfig.ATTENDANCE_PER_SCORE);
        long moneyGained = Math.round(attendance * GameConfig.MONEY_PER_ATTENDANCE);

        p.setMoney(p.getMoney() + moneyGained);
        p.setCurrentWeek(p.getCurrentWeek() + 1);
        p.setFreeGachaRemaining(GameConfig.GACHA_FREE_PER_WEEK); // 週替わりで無料ガチャ回復
        playerRepo.save(p);

        return new Dtos.LiveResultDto(
                p.getCurrentWeek() - 1, totalScore, bonus, bonusLabel,
                attendance, moneyGained, breakdown, buildState(p, chars));
    }

    private boolean allFriendly(Set<String> makers) {
        List<String> list = new ArrayList<>(makers);
        for (int i = 0; i < list.size(); i++) {
            for (int j = i + 1; j < list.size(); j++) {
                var a = Catalog.maker(list.get(i));
                if (a == null || !a.friendlyMakers().contains(list.get(j))) return false;
            }
        }
        return true;
    }

    // ---- API: ガチャ ----
    @Transactional
    public Dtos.GachaResultDto gacha(Dtos.GachaRequest req) {
        PlayerState p = getOrCreate();
        List<OwnedCharacter> chars = owned();
        settleProgression(p, chars);

        Set<String> ownedIds = chars.stream().map(OwnedCharacter::getCharacterId).collect(Collectors.toSet());
        if (ownedIds.size() >= Catalog.CHARACTERS.size()) {
            throw new IllegalStateException("すべてのキャラを集めました。これ以上排出できません。");
        }

        boolean paid = req != null && req.paid();
        long spent = 0;
        if (paid) {
            if (p.getMoney() < GameConfig.GACHA_PAID_COST) {
                throw new IllegalStateException("お金が足りません(必要: " + GameConfig.GACHA_PAID_COST + ")。");
            }
            p.setMoney(p.getMoney() - GameConfig.GACHA_PAID_COST);
            spent = GameConfig.GACHA_PAID_COST;
        } else {
            if (p.getFreeGachaRemaining() <= 0) {
                throw new IllegalStateException("無料ガチャの残り回数がありません(ライブ開催で回復)。");
            }
            p.setFreeGachaRemaining(p.getFreeGachaRemaining() - 1);
        }

        String got = rollFromPool(ownedIds);
        long now = System.currentTimeMillis();
        ownedRepo.save(new OwnedCharacter(PLAYER_ID, got, 0.0, now));
        playerRepo.save(p);

        CharacterDef def = Catalog.character(got);
        return new Dtos.GachaResultDto(got, def.rarity().name(), spent, !paid, buildState(p, owned()));
    }

    /** 既所持を除外し、レア度ウェイトで1体を抽選する(重複なし)。 */
    private String rollFromPool(Set<String> exclude) {
        List<CharacterDef> pool = Catalog.CHARACTERS.stream()
                .filter(c -> !exclude.contains(c.id()))
                .toList();
        if (pool.isEmpty()) throw new IllegalStateException("排出可能なキャラがいません。");
        double total = pool.stream().mapToDouble(c -> c.rarity().gachaWeight()).sum();
        double r = ThreadLocalRandom.current().nextDouble(total);
        double acc = 0;
        for (CharacterDef c : pool) {
            acc += c.rarity().gachaWeight();
            if (r < acc) return c.id();
        }
        return pool.get(pool.size() - 1).id();
    }

    // ---- API: 転生 ----
    @Transactional
    public Dtos.ReincarnateResultDto reincarnate() {
        PlayerState p = getOrCreate();
        List<OwnedCharacter> chars = owned();
        settleProgression(p, chars);

        long maxed = chars.stream().filter(c -> ProgressionCalculator.isMaxed(c.getTechParam())).count();
        if (maxed < GameConfig.REINCARNATE_REQUIRED_MAXED) {
            throw new IllegalStateException("転生には手持ち " + GameConfig.REINCARNATE_REQUIRED_MAXED
                    + " 体のカンストが必要です(現在 " + maxed + " 体)。");
        }
        for (OwnedCharacter c : chars) {
            c.setTechParam(0.0);
        }
        ownedRepo.saveAll(chars);

        double newSense = Math.min(GameConfig.SENSE_MAX,
                p.getSenseParam() + GameConfig.SENSE_GAIN_PER_REINCARNATE);
        p.setSenseParam(newSense);
        p.setLastSaveMillis(System.currentTimeMillis());
        playerRepo.save(p);

        return new Dtos.ReincarnateResultDto(newSense, buildState(p, chars));
    }

    // ---- API: リセット(開発/テスト用) ----
    @Transactional
    public Dtos.StateDto reset() {
        List<OwnedCharacter> chars = owned();
        ownedRepo.deleteAll(chars);
        playerRepo.deleteById(PLAYER_ID);
        return getState();
    }
}
