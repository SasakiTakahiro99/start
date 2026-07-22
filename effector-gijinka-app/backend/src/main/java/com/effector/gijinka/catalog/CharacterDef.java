package com.effector.gijinka.catalog;

/**
 * キャラクター(個別機種)。
 * name=機種名, makerId=国, effectTypeId=種別, rarity=レア度,
 * uniqueEffectDesc=固有効果の説明, history=歴史/開発背景の読み物, colorHex=ビジュアルの基調色。
 * ビジュアルと音源はフロント側でこの属性からダミー生成する。
 */
public record CharacterDef(
        String id,
        String name,
        String makerId,
        String effectTypeId,
        Rarity rarity,
        String personality,
        String uniqueEffectDesc,
        String history,
        String colorHex
) {
    /** 固有効果の flat 加算値。レア度から決まる(仮値)。 */
    public int uniqueEffectFlat() {
        return rarity.uniqueEffectFlat();
    }
}
