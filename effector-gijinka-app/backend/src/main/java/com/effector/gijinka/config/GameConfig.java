package com.effector.gijinka.config;

/**
 * 主要な仮値(バランス調整パラメーター)を一箇所に集約。
 * ここの数値を変えるだけでゲームバランスを調整できる。
 * フロントエンドにも /api/config で同じ値を配信し、練習フェーズの表示補間に使う。
 */
public final class GameConfig {

    private GameConfig() {}

    // ===== 練習フェーズ(技術パラメーター上昇) =====
    /** 基本上昇レート(技術ポイント / 秒)。ソフトキャップ未満はこの速度。 */
    public static final double BASE_RATE_PER_SEC = 1.0;
    /** ソフトキャップ。ここを超えると上昇が鈍化する。 */
    public static final double SOFT_CAP = 300.0;
    /** ハードキャップ(カンスト値)。これ以上は上がらない。 */
    public static final double HARD_CAP = 500.0;
    /** ソフトキャップ超過後の上昇速度倍率(0.0〜1.0)。 */
    public static final double SOFT_CAP_SLOW_FACTOR = 0.2;
    /**
     * オフライン進行で一度に加算する経過時間の上限(秒)。
     * ハードキャップ計算は別途効くが、極端な放置を穏やかにするための保険。
     * 24時間 = 86400秒。0以下で無制限。
     */
    public static final long OFFLINE_MAX_ELAPSED_SEC = 86400L;

    // ===== ライブフェーズ =====
    public static final int FORMATION_MIN = 1;
    public static final int FORMATION_MAX = 8;
    /** 集客数 = (編成合計スコア) * ATTENDANCE_PER_SCORE。 */
    public static final double ATTENDANCE_PER_SCORE = 0.5;
    /** お金 = 集客数 * MONEY_PER_ATTENDANCE。 */
    public static final double MONEY_PER_ATTENDANCE = 3.0;
    /** 同一メーカー統一ボーナス倍率。 */
    public static final double BONUS_SAME_MAKER = 1.3;
    /** 友好関係メーカー混成ボーナス倍率。 */
    public static final double BONUS_FRIENDLY_MIX = 1.15;

    // ===== ガチャ =====
    /** 有料ガチャ1回の価格(お金)。 */
    public static final long GACHA_PAID_COST = 500L;
    /** 無料ガチャの週あたり回数。ライブを開催すると回復する。 */
    public static final int GACHA_FREE_PER_WEEK = 1;
    // キャラ1体あたりの排出ウェイト(レア度で決定・やや渋め)。プール内の全キャラのウェイト合計に対する比率で抽選する。
    // 重複排出なし(既所持はプール除外)のため、所持が増えると各レア度の実効排出率は動的に変わる。合計値は自由(比率のみ効く)。
    public static final double GACHA_WEIGHT_NORMAL = 70.0;
    public static final double GACHA_WEIGHT_RARE = 22.0;
    public static final double GACHA_WEIGHT_VINTAGE = 6.0;
    public static final double GACHA_WEIGHT_LIMITED = 2.0;

    // ===== 転生 =====
    /** 転生に必要な「カンスト済み手持ち」数。 */
    public static final int REINCARNATE_REQUIRED_MAXED = 5;
    /** 転生1回あたりのセンス上昇幅。 */
    public static final double SENSE_GAIN_PER_REINCARNATE = 0.1;
    /** センスの初期値。 */
    public static final double SENSE_START = 1.0;
    /** センスの上限。 */
    public static final double SENSE_MAX = 10.0;

    // ===== 初期リソース =====
    public static final long START_MONEY = 800L;
}
