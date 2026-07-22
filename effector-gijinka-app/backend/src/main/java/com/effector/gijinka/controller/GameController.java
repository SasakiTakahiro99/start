package com.effector.gijinka.controller;

import com.effector.gijinka.dto.Dtos;
import com.effector.gijinka.service.GameService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api")
@CrossOrigin
public class GameController {

    private final GameService game;

    public GameController(GameService game) {
        this.game = game;
    }

    @GetMapping("/config")
    public Dtos.ConfigDto config() {
        return game.getConfig();
    }

    @GetMapping("/state")
    public Dtos.StateDto state() {
        return game.getState();
    }

    @PostMapping("/init")
    public Dtos.StateDto init(@RequestBody Dtos.InitRequest req) {
        return game.init(req);
    }

    @PostMapping("/formation")
    public Dtos.StateDto formation(@RequestBody Dtos.FormationRequest req) {
        return game.setFormation(req);
    }

    @PostMapping("/live")
    public Dtos.LiveResultDto live() {
        return game.runLive();
    }

    @PostMapping("/gacha")
    public Dtos.GachaResultDto gacha(@RequestBody(required = false) Dtos.GachaRequest req) {
        return game.gacha(req);
    }

    @PostMapping("/reincarnate")
    public Dtos.ReincarnateResultDto reincarnate() {
        return game.reincarnate();
    }

    @PostMapping("/reset")
    public Dtos.StateDto reset() {
        return game.reset();
    }

    // ゲームロジック上の不正操作(お金不足・条件未達など)は 400 で理由を返す。
    @ExceptionHandler({IllegalStateException.class, IllegalArgumentException.class})
    public ResponseEntity<Map<String, String>> handleBadRequest(RuntimeException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", ex.getMessage()));
    }
}
