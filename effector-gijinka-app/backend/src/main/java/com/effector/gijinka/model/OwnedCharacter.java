package com.effector.gijinka.model;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;

/** プレイヤーが所持している1体のキャラ(技術パラメーターを持つ)。 */
@Entity
public class OwnedCharacter {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String playerId;
    private String characterId;
    private double techParam;
    private long acquiredMillis;

    public OwnedCharacter() {}

    public OwnedCharacter(String playerId, String characterId, double techParam, long acquiredMillis) {
        this.playerId = playerId;
        this.characterId = characterId;
        this.techParam = techParam;
        this.acquiredMillis = acquiredMillis;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getPlayerId() { return playerId; }
    public void setPlayerId(String playerId) { this.playerId = playerId; }

    public String getCharacterId() { return characterId; }
    public void setCharacterId(String characterId) { this.characterId = characterId; }

    public double getTechParam() { return techParam; }
    public void setTechParam(double techParam) { this.techParam = techParam; }

    public long getAcquiredMillis() { return acquiredMillis; }
    public void setAcquiredMillis(long acquiredMillis) { this.acquiredMillis = acquiredMillis; }
}
