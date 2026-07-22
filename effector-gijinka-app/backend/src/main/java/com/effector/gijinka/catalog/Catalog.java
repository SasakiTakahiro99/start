package com.effector.gijinka.catalog;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * マスターデータ(静的カタログ)。
 * 国(メーカー)2, エフェクター種別10, キャラクター20 を定義する。
 * プレイヤー所持状態はDBに保存するが、このカタログ自体はコード定義の固定データ。
 */
public final class Catalog {

    private Catalog() {}

    public static final List<MakerDef> MAKERS = List.of(
            new MakerDef("boss", "BOSS", "日本", "堅実で万能。誰の足元にも馴染む優等生気質。", "#F08A24", List.of("ibanez")),
            new MakerDef("ibanez", "Ibanez", "日本", "枠にとらわれない自由さ。世界の名機を生んだ挑戦者。", "#3E7A3A", List.of("boss"))
    );

    public static final List<EffectTypeDef> EFFECT_TYPES = List.of(
            new EffectTypeDef("od", "オーバードライブ"),
            new EffectTypeDef("dist", "ディストーション"),
            new EffectTypeDef("fuzz", "ファズ"),
            new EffectTypeDef("delay", "ディレイ"),
            new EffectTypeDef("reverb", "リバーブ"),
            new EffectTypeDef("chorus", "コーラス"),
            new EffectTypeDef("flanger", "フランジャー"),
            new EffectTypeDef("phaser", "フェイザー"),
            new EffectTypeDef("comp", "コンプレッサー"),
            new EffectTypeDef("tremolo", "トレモロ")
    );

    public static final List<CharacterDef> CHARACTERS = List.of(
            // ===== BOSS =====
            new CharacterDef("boss-od1", "OD-1", "boss", "od", Rarity.VINTAGE,
                    "元祖の落ち着き。少し古風だが芯が強い。",
                    "非対称クリップの温かい歪みで、バンド全体を柔らかくまとめる。",
                    "1977年発売。BOSSコンパクト初のオーバードライブで、非対称クリッピング回路の原点。後の多くの歪みの祖となった。",
                    "#E8C33A"),
            new CharacterDef("boss-sd1", "SD-1", "boss", "od", Rarity.NORMAL,
                    "明るく親しみやすい世話役。",
                    "軽い歪みでどんな編成にも溶け込み、崩れにくくする。",
                    "1981年発売。OD-1の思想を受け継ぎトーンつまみを追加。長年生産される定番中の定番。",
                    "#F2D33B"),
            new CharacterDef("boss-bd2", "BD-2", "boss", "od", Rarity.RARE,
                    "歯切れのよいクールな性格。",
                    "反応の速い歪みでピッキングの強弱をそのまま集客の勢いに変える。",
                    "1995年発売。ブルースドライバーの名で親しまれ、透明感とジャリっとした質感が支持される。",
                    "#2E6FB0"),
            new CharacterDef("boss-ds1", "DS-1", "boss", "dist", Rarity.NORMAL,
                    "元気いっぱいのムードメーカー。",
                    "鋭いディストーションで観客のテンションを一段引き上げる。",
                    "1978年発売。オレンジ筐体のBOSS最初期ディストーション。世界中の入門機として愛される。",
                    "#F08A24"),
            new CharacterDef("boss-dd3", "DD-3", "boss", "delay", Rarity.RARE,
                    "几帳面で正確なタイムキーパー。",
                    "クリアなデジタルディレイで演奏の粒を整え、失敗を目立たなくする。",
                    "1986年発売。デジタルディレイを足元サイズに定着させた立役者。クリアな山びこが特徴。",
                    "#D8DCE0"),
            new CharacterDef("boss-dm2", "DM-2", "boss", "delay", Rarity.VINTAGE,
                    "ノスタルジックで温もりのある性格。",
                    "アナログの滲むディレイが会場に独特の空気感を生み、リピーターを増やす。",
                    "1981年発売のアナログディレイ。BBD素子の温かい繰り返しが今も人気で中古相場が高い。",
                    "#2E7D5B"),
            new CharacterDef("boss-ce2", "CE-2", "boss", "chorus", Rarity.RARE,
                    "涼やかでおしゃれな雰囲気。",
                    "揺れるコーラスで音に厚みを足し、編成全体を華やかに見せる。",
                    "1979年発売。ローランドのコーラスを単体ペダル化した先駆け。80年代サウンドの象徴。",
                    "#5FA9D6"),
            new CharacterDef("boss-rv6", "RV-6", "boss", "reverb", Rarity.NORMAL,
                    "包容力のある癒し系。",
                    "上質なリバーブで会場を広く感じさせ、観客の満足度を底上げする。",
                    "2015年発売。長い歴史を持つBOSSリバーブの現行進化形で、自然な残響が評価される。",
                    "#2FA6A0"),
            new CharacterDef("boss-cs3", "CS-3", "boss", "comp", Rarity.NORMAL,
                    "控えめだが縁の下の力持ち。",
                    "コンプで粒を揃え、編成の合計スコアを底上げする。",
                    "1986年発売。サステインと粒立ちを整える定番コンプ。地味だが多くのボードに常駐する。",
                    "#4A6FA5"),
            new CharacterDef("boss-tr2", "TR-2", "boss", "tremolo", Rarity.NORMAL,
                    "リズミカルで陽気。",
                    "揺れるトレモロで演出を派手にし、集客の掴みを強くする。",
                    "1997年発売。音量を周期的に揺らす古典的トレモロを扱いやすくまとめた一台。",
                    "#3E9E52"),

            // ===== Ibanez =====
            new CharacterDef("ibz-ts808", "TS808", "ibanez", "od", Rarity.LIMITED,
                    "伝説的なカリスマ。物腰は穏やかだが格が違う。",
                    "ミッドを押し出す唯一無二の歪みで、編成全体を一段上の説得力に引き上げる。",
                    "1979年頃登場。チューブスクリーマーの原点にして頂点。世界中のプロが求める緑の名機。",
                    "#3E7A3A"),
            new CharacterDef("ibz-ts9", "TS9", "ibanez", "od", Rarity.RARE,
                    "TS808を慕う明るい後輩肌。",
                    "少し前に出るミッドで、リードを目立たせ集客を伸ばす。",
                    "1982年発売。TS808の後継で、やや前に出るサウンド。再発を重ねる人気モデル。",
                    "#4C8A3E"),
            new CharacterDef("ibz-tsmini", "TS Mini", "ibanez", "od", Rarity.NORMAL,
                    "小柄で身軽なムードメーカー。",
                    "軽快な歪みで小さな会場でも器用に立ち回る。",
                    "2015年発売。定番チューブスクリーマーを省スペース化した現行の入門機。",
                    "#5C9A4E"),
            new CharacterDef("ibz-sd9", "SD9", "ibanez", "dist", Rarity.RARE,
                    "骨太で少し無骨な職人肌。",
                    "太いディストーションで音圧を稼ぎ、集客の下支えをする。",
                    "1980年代のマスターシリーズの一角。太く粘るディストーションで根強いファンを持つ。",
                    "#8A8F94"),
            new CharacterDef("ibz-ad9", "AD9", "ibanez", "delay", Rarity.VINTAGE,
                    "渋くて味のある古株。",
                    "アナログディレイの滲みで演奏に奥行きを与え、満足度を高める。",
                    "1980年代のアナログディレイ名機。温かく減衰する繰り返しがヴィンテージ市場で人気。",
                    "#E07A2C"),
            new CharacterDef("ibz-cs9", "CS9", "ibanez", "chorus", Rarity.RARE,
                    "華やかでステージ映えする性格。",
                    "ステレオコーラスで音場を広げ、編成を豪華に見せる。",
                    "マスターシリーズのステレオコーラス。広がりのある揺らぎで空間を彩る。",
                    "#7E5AA6"),
            new CharacterDef("ibz-fl9", "FL9", "ibanez", "flanger", Rarity.VINTAGE,
                    "クセが強く個性的なアーティスト気質。",
                    "うねるフランジャーで強烈な印象を残し、話題性で集客を伸ばす。",
                    "1980年代のフランジャー。ジェット機のようなうねりで唯一無二の存在感を放つ。",
                    "#6E4FA0"),
            new CharacterDef("ibz-ph7", "PH7", "ibanez", "phaser", Rarity.NORMAL,
                    "ゆったりマイペース。",
                    "フェイザーの揺らぎで演奏に色気を足し、印象を柔らかくする。",
                    "うねる位相変化を作るフェイザー。コントロールが豊富で幅広い揺れを出せる。",
                    "#E0902C"),
            new CharacterDef("ibz-cp9", "CP9", "ibanez", "comp", Rarity.NORMAL,
                    "冷静沈着なサポーター。",
                    "コンプで粒を整え、編成合計スコアを安定して底上げする。",
                    "マスターシリーズのコンプレッサー/リミッター。粒立ちを整える実務派の一台。",
                    "#9AA0A6"),
            new CharacterDef("ibz-fz7", "FZ7", "ibanez", "fuzz", Rarity.RARE,
                    "破天荒で爆発力のある暴れん坊。",
                    "荒々しいファズで一気に会場を沸かせ、集客を跳ね上げる。",
                    "トーンロック回路を持つファズ。ヴィンテージ然とした荒い歪みからモダンな爆音まで対応。",
                    "#333840")
    );

    // ---- 参照ヘルパー ----
    private static final Map<String, CharacterDef> CHAR_BY_ID = new LinkedHashMap<>();
    private static final Map<String, MakerDef> MAKER_BY_ID = new LinkedHashMap<>();
    static {
        for (CharacterDef c : CHARACTERS) CHAR_BY_ID.put(c.id(), c);
        for (MakerDef m : MAKERS) MAKER_BY_ID.put(m.id(), m);
    }

    public static CharacterDef character(String id) { return CHAR_BY_ID.get(id); }
    public static boolean hasCharacter(String id) { return CHAR_BY_ID.containsKey(id); }
    public static MakerDef maker(String id) { return MAKER_BY_ID.get(id); }
    public static boolean hasMaker(String id) { return MAKER_BY_ID.containsKey(id); }

    /** 指定メーカーのODキャラ(スターター選択A用)。 */
    public static List<CharacterDef> overdrivesOf(String makerId) {
        return CHARACTERS.stream()
                .filter(c -> c.makerId().equals(makerId) && c.effectTypeId().equals("od"))
                .toList();
    }
}
