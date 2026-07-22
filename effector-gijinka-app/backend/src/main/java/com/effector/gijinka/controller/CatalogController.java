package com.effector.gijinka.controller;

import com.effector.gijinka.catalog.Catalog;
import com.effector.gijinka.dto.Dtos;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/catalog")
@CrossOrigin
public class CatalogController {

    @GetMapping
    public Dtos.CatalogDto catalog() {
        var makers = Catalog.MAKERS.stream()
                .map(m -> new Dtos.MakerDto(m.id(), m.name(), m.country(), m.culture(), m.colorHex(), m.friendlyMakers()))
                .toList();
        var types = Catalog.EFFECT_TYPES.stream()
                .map(t -> new Dtos.EffectTypeDto(t.id(), t.name()))
                .toList();
        var chars = Catalog.CHARACTERS.stream()
                .map(c -> new Dtos.CatalogCharDto(
                        c.id(), c.name(), c.makerId(), c.effectTypeId(),
                        c.rarity().name(), c.rarity().label(), c.uniqueEffectFlat(),
                        c.personality(), c.uniqueEffectDesc(), c.history(), c.colorHex()))
                .toList();
        return new Dtos.CatalogDto(makers, types, chars);
    }
}
