package com.effector.gijinka;

import com.effector.gijinka.controller.AuthController;
import com.effector.gijinka.dto.Dtos;
import com.effector.gijinka.model.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.crypto.password.PasswordEncoder;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * existsByUsername チェック後に、同名ユーザーの同時登録でDBのユニーク制約違反が発生した場合の挙動を検証する。
 * (実際の同時リクエストを再現する代わりに、save時にDataIntegrityViolationExceptionを投げるようモックする)
 */
@ExtendWith(MockitoExtension.class)
class AuthControllerRaceConditionTest {

    @Mock
    UserRepository userRepo;
    @Mock
    PasswordEncoder passwordEncoder;
    @Mock
    AuthenticationManager authenticationManager;
    @Mock
    HttpServletRequest request;
    @Mock
    HttpServletResponse response;

    @Test
    void duplicateUsernameRaceConditionYieldsBadRequestInsteadOf500() {
        when(userRepo.existsByUsername(any())).thenReturn(false);
        when(passwordEncoder.encode(any())).thenReturn("hashed");
        when(userRepo.save(any())).thenThrow(new DataIntegrityViolationException("unique constraint violated"));

        AuthController controller = new AuthController(userRepo, passwordEncoder, authenticationManager);
        Dtos.AuthRequest req = new Dtos.AuthRequest("racer", "password123");

        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class,
                () -> controller.register(req, request, response));

        // AuthController#handleBadRequest がこの例外を400に変換する(existsByUsernameチェックと同じ扱い)
        var body = controller.handleBadRequest(ex);
        org.junit.jupiter.api.Assertions.assertEquals(
                org.springframework.http.HttpStatus.BAD_REQUEST, body.getStatusCode());
    }
}
