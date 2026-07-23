package com.effector.gijinka.controller;

import com.effector.gijinka.dto.Dtos;
import com.effector.gijinka.model.User;
import com.effector.gijinka.model.UserRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import java.util.Map;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 新規登録・ログイン・ログアウト・現在ユーザー取得。セッション/Cookieベースの認証。 */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final UserRepository userRepo;
    private final PasswordEncoder passwordEncoder;
    private final AuthenticationManager authenticationManager;
    private final SecurityContextRepository securityContextRepository = new HttpSessionSecurityContextRepository();

    public AuthController(UserRepository userRepo, PasswordEncoder passwordEncoder,
                           AuthenticationManager authenticationManager) {
        this.userRepo = userRepo;
        this.passwordEncoder = passwordEncoder;
        this.authenticationManager = authenticationManager;
    }

    @PostMapping("/register")
    public Dtos.UserDto register(@RequestBody Dtos.AuthRequest req, HttpServletRequest request, HttpServletResponse response) {
        String username = normalizeUsername(req.username());
        validateCredentials(username, req.password());
        if (userRepo.existsByUsername(username)) {
            throw new IllegalArgumentException("そのユーザー名はすでに使われています: " + username);
        }

        User u = new User();
        u.setUsername(username);
        u.setPasswordHash(passwordEncoder.encode(req.password()));
        u.setCreatedMillis(System.currentTimeMillis());
        try {
            userRepo.save(u);
        } catch (DataIntegrityViolationException e) {
            // existsByUsername チェック後に同名ユーザーが同時登録された場合のレース対策。
            throw new IllegalArgumentException("そのユーザー名はすでに使われています: " + username);
        }

        authenticateAndBindSession(username, req.password(), request, response);
        return new Dtos.UserDto(username);
    }

    @PostMapping("/login")
    public Dtos.UserDto login(@RequestBody Dtos.AuthRequest req, HttpServletRequest request, HttpServletResponse response) {
        authenticateAndBindSession(req.username(), req.password(), request, response);
        return new Dtos.UserDto(req.username());
    }

    @PostMapping("/logout")
    public void logout(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }
        SecurityContextHolder.clearContext();
    }

    @GetMapping("/me")
    public ResponseEntity<?> me(Authentication auth) {
        if (auth == null || !auth.isAuthenticated() || auth instanceof AnonymousAuthenticationToken) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "未ログインです。"));
        }
        return ResponseEntity.ok(new Dtos.UserDto(auth.getName()));
    }

    private void authenticateAndBindSession(String username, String password,
                                             HttpServletRequest request, HttpServletResponse response) {
        Authentication authenticated = authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(username, password));
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authenticated);
        SecurityContextHolder.setContext(context);
        securityContextRepository.saveContext(context, request, response);
    }

    private String normalizeUsername(String username) {
        if (username == null || username.isBlank()) {
            throw new IllegalArgumentException("ユーザー名を入力してください。");
        }
        return username.trim();
    }

    private void validateCredentials(String username, String password) {
        if (username.length() < 3 || username.length() > 32) {
            throw new IllegalArgumentException("ユーザー名は3〜32文字で入力してください。");
        }
        if (password == null || password.length() < 8) {
            throw new IllegalArgumentException("パスワードは8文字以上で入力してください。");
        }
    }

    @ExceptionHandler({IllegalStateException.class, IllegalArgumentException.class})
    public ResponseEntity<Map<String, String>> handleBadRequest(RuntimeException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(AuthenticationException.class)
    public ResponseEntity<Map<String, String>> handleAuthFailure(AuthenticationException ex) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(Map.of("error", "ユーザー名またはパスワードが正しくありません。"));
    }
}
