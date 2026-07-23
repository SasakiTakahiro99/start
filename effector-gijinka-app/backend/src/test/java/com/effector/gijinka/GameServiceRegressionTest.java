package com.effector.gijinka;

import com.effector.gijinka.catalog.Catalog;
import com.effector.gijinka.catalog.CharacterDef;
import com.effector.gijinka.config.GameConfig;
import com.effector.gijinka.dto.Dtos;
import com.effector.gijinka.model.OwnedCharacter;
import com.effector.gijinka.model.OwnedCharacterRepository;
import com.effector.gijinka.model.PlayerState;
import com.effector.gijinka.model.PlayerStateRepository;
import com.effector.gijinka.service.GameService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * GameService の「壊れると致命的だが従来テストが無かった」ガード挙動の回帰テスト。
 * ガチャの金銭安全 / 転生ゲート / 編成バリデーション / 時計巻き戻しを DB 込みで固定する。
 * 数値バランスは検証せず、あくまで正しい挙動(拒否・クランプ・非減少)を固定するのが目的。
 */
@SpringBootTest
@TestPropertySource(properties = {
        "spring.datasource.url=jdbc:h2:mem:gsregtest;DB_CLOSE_DELAY=-1",
        "spring.jpa.hibernate.ddl-auto=create-drop"
})
class GameServiceRegressionTest {

    /** 認証済みユーザーIDに相当する固定値(このテスト専用)。 */
    private static final String PLAYER_ID = "regression-user";

    @Autowired GameService game;
    @Autowired PlayerStateRepository playerRepo;
    @Autowired OwnedCharacterRepository ownedRepo;

    // ---- helpers ----

    /** 所持していなければ指定技術値で1体所持させる。 */
    private void own(String characterId, double tech) {
        if (!ownedRepo.existsByPlayerIdAndCharacterId(PLAYER_ID, characterId)) {
            ownedRepo.save(new OwnedCharacter(PLAYER_ID, characterId, tech, System.currentTimeMillis()));
        }
    }

    /** カタログ先頭から count 体を、starter を除いて指定技術値で所持させ、所持IDを返す。 */
    private List<String> ownFirst(int count, double tech, String starterId) {
        List<String> ids = new ArrayList<>();
        ids.add(starterId);
        for (CharacterDef def : Catalog.CHARACTERS) {
            if (ids.size() >= count) break;
            if (def.id().equals(starterId)) continue;
            own(def.id(), tech);
            ids.add(def.id());
        }
        return ids;
    }

    private PlayerState player() {
        return playerRepo.findById(PLAYER_ID).orElseThrow();
    }

    /** 現在の全所持キャラの技術値をカンスト(ハードキャップ)に揃える。 */
    private void maxAllOwned() {
        List<OwnedCharacter> all = ownedRepo.findByPlayerId(PLAYER_ID);
        for (OwnedCharacter c : all) {
            c.setTechParam(GameConfig.HARD_CAP);
        }
        ownedRepo.saveAll(all);
    }

    // ===== ガチャ全所持時の金銭安全 =====

    @Test
    void gachaWhenAllOwnedConsumesNothingAndIsRejected() {
        game.reset(PLAYER_ID);
        game.init(PLAYER_ID, new Dtos.InitRequest("boss", "od", "boss-sd1"));
        // 全キャラを所持済みにする
        for (CharacterDef def : Catalog.CHARACTERS) {
            own(def.id(), 0.0);
        }

        PlayerState before = player();
        long moneyBefore = before.getMoney();
        int freeBefore = before.getFreeGachaRemaining();
        // 前提: そのままなら引ける状態(残高・無料券が足りている)であること
        assertTrue(moneyBefore >= GameConfig.GACHA_PAID_COST, "有料ガチャ可能な残高が前提");
        assertTrue(freeBefore > 0, "無料ガチャ可能な残数が前提");

        // 有料ガチャ: 拒否され、お金は減らない
        assertThrows(IllegalStateException.class, () -> game.gacha(PLAYER_ID, new Dtos.GachaRequest(true)));
        assertEquals(moneyBefore, player().getMoney(), "全所持時は有料でもお金を消費しない");

        // 無料ガチャ: 拒否され、無料券も減らない
        assertThrows(IllegalStateException.class, () -> game.gacha(PLAYER_ID, new Dtos.GachaRequest(false)));
        assertEquals(freeBefore, player().getFreeGachaRemaining(), "全所持時は無料券も消費しない");
    }

    // ===== 転生ゲート =====

    @Test
    void reincarnateRejectedBelowRequiredMaxed() {
        game.reset(PLAYER_ID);
        game.init(PLAYER_ID, new Dtos.InitRequest("boss", "od", "boss-sd1"));
        // カンストは必要数-1 体だけ
        ownFirst(GameConfig.REINCARNATE_REQUIRED_MAXED - 1, GameConfig.HARD_CAP, "boss-sd1");

        assertThrows(IllegalStateException.class, () -> game.reincarnate(PLAYER_ID));
    }

    @Test
    void reincarnateSucceedsWithRequiredMaxedAndResetsTech() {
        game.reset(PLAYER_ID);
        game.init(PLAYER_ID, new Dtos.InitRequest("boss", "od", "boss-sd1"));
        // 必要数ちょうどをカンストさせる(starter含む)
        List<String> maxedIds = ownFirst(GameConfig.REINCARNATE_REQUIRED_MAXED, GameConfig.HARD_CAP, "boss-sd1");
        maxAllOwned();

        game.reincarnate(PLAYER_ID);

        // 転生後は全技術値が0リセット
        for (OwnedCharacter c : ownedRepo.findByPlayerId(PLAYER_ID)) {
            assertEquals(0.0, c.getTechParam(), 1e-9, "転生後は技術値が0リセットされる");
        }
        assertTrue(maxedIds.size() >= GameConfig.REINCARNATE_REQUIRED_MAXED);
    }

    @Test
    void reincarnateClampsSenseAtMax() {
        game.reset(PLAYER_ID);
        game.init(PLAYER_ID, new Dtos.InitRequest("boss", "od", "boss-sd1"));
        ownFirst(GameConfig.REINCARNATE_REQUIRED_MAXED, GameConfig.HARD_CAP, "boss-sd1");
        maxAllOwned();

        // 1回の上昇でちょうど上限を跨ぐ手前にセンスを寄せる
        PlayerState p = player();
        p.setSenseParam(GameConfig.SENSE_MAX - GameConfig.SENSE_GAIN_PER_REINCARNATE / 2.0);
        playerRepo.save(p);

        Dtos.ReincarnateResultDto res = game.reincarnate(PLAYER_ID);

        assertEquals(GameConfig.SENSE_MAX, res.newSense(), 1e-9, "センスは上限を超えない(クランプ)");
        assertTrue(player().getSenseParam() <= GameConfig.SENSE_MAX + 1e-9);
    }

    // ===== ライブ編成バリデーション =====

    @Test
    void liveRejectedWithEmptyFormation() {
        game.reset(PLAYER_ID);
        game.init(PLAYER_ID, new Dtos.InitRequest("boss", "od", "boss-sd1"));
        game.setFormation(PLAYER_ID, new Dtos.FormationRequest(List.of())); // 空編成

        assertThrows(IllegalStateException.class, () -> game.runLive(PLAYER_ID));
    }

    @Test
    void formationOverMaxRejected() {
        game.reset(PLAYER_ID);
        game.init(PLAYER_ID, new Dtos.InitRequest("boss", "od", "boss-sd1"));
        // 上限+1 体を所持し、その全てを編成に指定する
        List<String> ids = ownFirst(GameConfig.FORMATION_MAX + 1, 0.0, "boss-sd1");
        assertEquals(GameConfig.FORMATION_MAX + 1, ids.size());

        assertThrows(IllegalArgumentException.class,
                () -> game.setFormation(PLAYER_ID, new Dtos.FormationRequest(ids)));
    }

    @Test
    void formationBoundariesAccepted() {
        game.reset(PLAYER_ID);
        game.init(PLAYER_ID, new Dtos.InitRequest("boss", "od", "boss-sd1"));

        // 最小(1体)は通り、ライブも開催できる
        Dtos.StateDto min = game.setFormation(PLAYER_ID, new Dtos.FormationRequest(List.of("boss-sd1")));
        assertEquals(1, min.formation().size());
        game.runLive(PLAYER_ID); // 例外が出ないこと

        // 最大(上限ちょうど)は通る
        List<String> maxIds = ownFirst(GameConfig.FORMATION_MAX, 0.0, "boss-sd1");
        assertEquals(GameConfig.FORMATION_MAX, maxIds.size());
        Dtos.StateDto max = game.setFormation(PLAYER_ID, new Dtos.FormationRequest(maxIds));
        assertEquals(GameConfig.FORMATION_MAX, max.formation().size());
    }

    // ===== 負の経過時間(時計巻き戻し) =====

    @Test
    void rewindingClockDoesNotDecreaseTechViaSettleProgression() {
        game.reset(PLAYER_ID);
        game.init(PLAYER_ID, new Dtos.InitRequest("boss", "od", "boss-sd1"));

        // 既存の技術値を既知の値に設定
        OwnedCharacter c = ownedRepo.findByPlayerId(PLAYER_ID).get(0);
        c.setTechParam(100.0);
        ownedRepo.save(c);

        // 最終セーブ時刻を未来にして経過を負(=時計巻き戻し)にする
        PlayerState p = player();
        p.setLastSaveMillis(System.currentTimeMillis() + 1_000_000L);
        playerRepo.save(p);

        Dtos.StateDto st = game.getState(PLAYER_ID);
        double tech = st.owned().get(0).techParam();
        assertTrue(tech >= 100.0, "巻き戻しで技術値が現在値を下回ってはいけない: " + tech);
        assertEquals(100.0, tech, 1e-6, "負の経過では技術値は変化しない");
    }
}
