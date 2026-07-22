package com.effector.gijinka.model;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface OwnedCharacterRepository extends JpaRepository<OwnedCharacter, Long> {
    List<OwnedCharacter> findByPlayerId(String playerId);
    boolean existsByPlayerIdAndCharacterId(String playerId, String characterId);
}
