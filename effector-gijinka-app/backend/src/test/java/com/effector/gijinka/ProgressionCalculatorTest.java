package com.effector.gijinka;

import com.effector.gijinka.config.GameConfig;
import com.effector.gijinka.service.ProgressionCalculator;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ProgressionCalculatorTest {

    @Test
    void risesAtBaseRateBelowSoftCap() {
        double v = ProgressionCalculator.advance(0, 10);
        assertEquals(10 * GameConfig.BASE_RATE_PER_SEC, v, 1e-9);
    }

    @Test
    void slowsAfterSoftCap() {
        // ソフトキャップちょうどから10秒 → 鈍化レートで上がる
        double v = ProgressionCalculator.advance(GameConfig.SOFT_CAP, 10);
        double expected = GameConfig.SOFT_CAP
                + GameConfig.BASE_RATE_PER_SEC * GameConfig.SOFT_CAP_SLOW_FACTOR * 10;
        assertEquals(expected, v, 1e-9);
    }

    @Test
    void crossesSoftCapCorrectlyInOnePass() {
        // ソフトキャップ手前から、境界をまたぐ経過時間を一括加算しても正しく鈍化が効く
        double start = GameConfig.SOFT_CAP - 5; // base=1.0なので5秒でソフト到達
        double v = ProgressionCalculator.advance(start, 15); // 残り10秒は鈍化
        double expected = GameConfig.SOFT_CAP
                + GameConfig.BASE_RATE_PER_SEC * GameConfig.SOFT_CAP_SLOW_FACTOR * 10;
        assertEquals(expected, v, 1e-9);
    }

    @Test
    void neverExceedsHardCapEvenForHugeElapsed() {
        // オフラインで極端に長時間放置してもハードキャップを超えない
        double v = ProgressionCalculator.advance(0, 100_000_000);
        assertEquals(GameConfig.HARD_CAP, v, 1e-9);
        assertTrue(ProgressionCalculator.isMaxed(v));
    }

    @Test
    void maxedDetection() {
        assertFalse(ProgressionCalculator.isMaxed(GameConfig.HARD_CAP - 1));
        assertTrue(ProgressionCalculator.isMaxed(GameConfig.HARD_CAP));
    }
}
