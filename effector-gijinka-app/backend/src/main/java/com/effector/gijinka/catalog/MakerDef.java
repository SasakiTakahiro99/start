package com.effector.gijinka.catalog;

import java.util.List;

/** 国(メーカー)。国同士の関係性(friendlyMakers)は編成ボーナスに使う。 */
public record MakerDef(
        String id,
        String name,
        String country,
        String culture,
        String colorHex,
        List<String> friendlyMakers
) {}
