package com.effector.gijinka.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;

/** プレイヤーのセーブデータ本体。ユーザー(username)ごとに1件持ち、複数アカウントに対応する。 */
@Entity
public class PlayerState {

    @Id
    private String id;

    private boolean initialized;
    private String initialMaker;

    private double senseParam;
    private long money;
    private int currentWeek;
    private int freeGachaRemaining;

    /** 編成中のキャラID(カンマ区切り、最大8)。 */
    @Column(length = 1000)
    private String formationCsv;

    /** 最終セーブ時刻(epoch millis)。オフライン進行の起点。 */
    private long lastSaveMillis;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public boolean isInitialized() { return initialized; }
    public void setInitialized(boolean initialized) { this.initialized = initialized; }

    public String getInitialMaker() { return initialMaker; }
    public void setInitialMaker(String initialMaker) { this.initialMaker = initialMaker; }

    public double getSenseParam() { return senseParam; }
    public void setSenseParam(double senseParam) { this.senseParam = senseParam; }

    public long getMoney() { return money; }
    public void setMoney(long money) { this.money = money; }

    public int getCurrentWeek() { return currentWeek; }
    public void setCurrentWeek(int currentWeek) { this.currentWeek = currentWeek; }

    public int getFreeGachaRemaining() { return freeGachaRemaining; }
    public void setFreeGachaRemaining(int freeGachaRemaining) { this.freeGachaRemaining = freeGachaRemaining; }

    public String getFormationCsv() { return formationCsv; }
    public void setFormationCsv(String formationCsv) { this.formationCsv = formationCsv; }

    public long getLastSaveMillis() { return lastSaveMillis; }
    public void setLastSaveMillis(long lastSaveMillis) { this.lastSaveMillis = lastSaveMillis; }
}
