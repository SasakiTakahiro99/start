package com.effector.gijinka;

import com.effector.gijinka.config.GameConfig;
import com.effector.gijinka.dto.Dtos;
import com.effector.gijinka.model.PlayerState;
import com.effector.gijinka.model.PlayerStateRepository;
import com.effector.gijinka.service.GameService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** オフライン進行(まとめて一括加算 + ハードキャップ)をDB込みで検証する。 */
@SpringBootTest
@TestPropertySource(properties = {
        "spring.datasource.url=jdbc:h2:mem:offtest;DB_CLOSE_DELAY=-1",
        "spring.jpa.hibernate.ddl-auto=create-drop"
})
class OfflineProgressionIntegrationTest {

    @Autowired GameService game;
    @Autowired PlayerStateRepository playerRepo;

    @Test
    void longOfflineGapIsBatchedAndCappedAtHardCap() {
        game.reset();
        game.init(new Dtos.InitRequest("boss", "od", "boss-sd1"));

        // 最終セーブ時刻を遠い過去に書き換え = 長時間オフラインの再現
        PlayerState p = playerRepo.findById(GameService.PLAYER_ID).orElseThrow();
        long moneyBefore = p.getMoney();
        p.setLastSaveMillis(System.currentTimeMillis() - 10_000_000_000L); // 約115日前
        playerRepo.save(p);

        Dtos.StateDto st = game.getState();

        // 経過が長大でもハードキャップ(カンスト)を超えない
        double tech = st.owned().get(0).techParam();
        assertEquals(GameConfig.HARD_CAP, tech, 1e-6, "ハードキャップで頭打ちになるべき");
        assertTrue(st.owned().get(0).maxed());
        // 進行以外の状態は保持される
        assertEquals(moneyBefore, st.money());
        assertEquals("boss", st.initialMaker());
    }

    @Test
    void shortOnlineGapRisesAtBaseRate() {
        game.reset();
        game.init(new Dtos.InitRequest("ibanez", "od", "ibz-ts9"));
        PlayerState p = playerRepo.findById(GameService.PLAYER_ID).orElseThrow();
        p.setLastSaveMillis(System.currentTimeMillis() - 5_000L); // 5秒
        playerRepo.save(p);

        Dtos.StateDto st = game.getState();
        double tech = st.owned().get(0).techParam();
        // 5秒 * base ぶん上がっている(ソフトキャップ未満)
        assertTrue(tech >= 4.0 && tech <= 6.5, "5秒でおよそ base*5 上昇: " + tech);
    }
}
