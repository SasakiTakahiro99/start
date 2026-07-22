package com.effector.gijinka.dto;

import java.util.List;

/** API入出力用のDTO群(records)。 */
public final class Dtos {

    private Dtos() {}

    public record ConfigDto(
            double baseRatePerSec,
            double softCap,
            double hardCap,
            double softCapSlowFactor,
            long gachaPaidCost,
            int freeGachaPerWeek,
            int formationMin,
            int formationMax,
            int reincarnateRequiredMaxed,
            double senseMax,
            double senseGainPerReincarnate
    ) {}

    public record OwnedCharDto(
            String characterId,
            double techParam,
            boolean maxed
    ) {}

    /** クライアントへ返すプレイヤー状態一式。 */
    public record StateDto(
            boolean initialized,
            String initialMaker,
            double sense,
            long money,
            int week,
            int freeGachaRemaining,
            List<String> formation,
            List<OwnedCharDto> owned,
            long serverTimeMillis,
            boolean canReincarnate,
            int maxedCount,
            ConfigDto config
    ) {}

    public record InitRequest(String maker, String method, String characterId) {}

    public record FormationRequest(List<String> characterIds) {}

    public record GachaRequest(boolean paid) {}

    public record LiveBreakdownDto(
            String characterId,
            double tech,
            int uniqueEffectFlat,
            double score
    ) {}

    public record LiveResultDto(
            int week,
            double totalScore,
            double bonusMultiplier,
            String bonusLabel,
            long attendance,
            long moneyGained,
            List<LiveBreakdownDto> breakdown,
            StateDto state
    ) {}

    public record GachaResultDto(
            String characterId,
            String rarity,
            long moneySpent,
            boolean free,
            StateDto state
    ) {}

    public record ReincarnateResultDto(
            double newSense,
            StateDto state
    ) {}

    // ---- カタログ(図鑑/マスターデータ) ----
    public record CatalogCharDto(
            String id,
            String name,
            String makerId,
            String effectTypeId,
            String rarity,
            String rarityLabel,
            int uniqueEffectFlat,
            String personality,
            String uniqueEffectDesc,
            String history,
            String colorHex
    ) {}

    public record MakerDto(
            String id,
            String name,
            String country,
            String culture,
            String colorHex,
            List<String> friendlyMakers
    ) {}

    public record EffectTypeDto(String id, String name) {}

    public record CatalogDto(
            List<MakerDto> makers,
            List<EffectTypeDto> effectTypes,
            List<CatalogCharDto> characters
    ) {}
}
