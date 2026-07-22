package com.effector.gijinka.service;

import com.effector.gijinka.config.GameConfig;

/**
 * 技術パラメーターの時間経過上昇を計算する純粋関数。
 * オンライン(毎回のstate取得)でもオフライン(まとめて一括加算)でも同じロジックを使う。
 *
 * 挙動:
 *  - ソフトキャップ未満: BASE_RATE_PER_SEC で上昇
 *  - ソフトキャップ〜ハードキャップ: BASE_RATE_PER_SEC * SOFT_CAP_SLOW_FACTOR で鈍化
 *  - ハードキャップ(カンスト)到達: それ以上は上がらない
 * 経過時間がどれだけ長くてもハードキャップを超えない。
 */
public final class ProgressionCalculator {

    private ProgressionCalculator() {}

    public static double advance(double current, double elapsedSec) {
        if (elapsedSec <= 0) return Math.min(current, GameConfig.HARD_CAP);
        double v = Math.min(current, GameConfig.HARD_CAP);
        if (v >= GameConfig.HARD_CAP) return GameConfig.HARD_CAP;

        double remaining = elapsedSec;
        double base = GameConfig.BASE_RATE_PER_SEC;

        // 通常速度ゾーン(ソフトキャップまで)
        if (v < GameConfig.SOFT_CAP) {
            double timeToSoft = (GameConfig.SOFT_CAP - v) / base;
            if (remaining <= timeToSoft) {
                return v + base * remaining;
            }
            v = GameConfig.SOFT_CAP;
            remaining -= timeToSoft;
        }

        // 鈍化ゾーン(ソフト〜ハード)
        double slow = base * GameConfig.SOFT_CAP_SLOW_FACTOR;
        if (slow <= 0) return v; // 念のため
        double gained = slow * remaining;
        return Math.min(GameConfig.HARD_CAP, v + gained);
    }

    /** カンスト(ハードキャップ到達)判定。浮動小数の誤差を考慮。 */
    public static boolean isMaxed(double tech) {
        return tech >= GameConfig.HARD_CAP - 1e-6;
    }
}
