package com.effector.gijinka.catalog;

import com.effector.gijinka.config.GameConfig;

public enum Rarity {
    NORMAL("通常", GameConfig.GACHA_WEIGHT_NORMAL, 20),
    RARE("レア", GameConfig.GACHA_WEIGHT_RARE, 50),
    VINTAGE("ヴィンテージ", GameConfig.GACHA_WEIGHT_VINTAGE, 100),
    LIMITED("限定モデル", GameConfig.GACHA_WEIGHT_LIMITED, 180);

    private final String label;
    private final double gachaWeight;
    private final int uniqueEffectFlat;

    Rarity(String label, double gachaWeight, int uniqueEffectFlat) {
        this.label = label;
        this.gachaWeight = gachaWeight;
        this.uniqueEffectFlat = uniqueEffectFlat;
    }

    public String label() { return label; }
    public double gachaWeight() { return gachaWeight; }
    /** レア度が高いほど大きい固有効果の加算値(ライブスコアに flat 加算)。 */
    public int uniqueEffectFlat() { return uniqueEffectFlat; }
}
