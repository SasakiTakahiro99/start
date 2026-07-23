package com.effector.gijinka;

import com.effector.gijinka.dto.Dtos;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.client5.http.impl.classic.HttpClientBuilder;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.HttpComponentsClientHttpRequestFactory;
import org.springframework.test.context.TestPropertySource;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 新規登録・ログイン・ログアウト・未ログイン時アクセス拒否を、実際のフィルタチェーンを通して
 * HTTP経由で検証する回帰テスト。セッションCookieは応答ヘッダーから取得し明示的に引き回す。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestPropertySource(properties = {
        "spring.datasource.url=jdbc:h2:mem:authtest;DB_CLOSE_DELAY=-1",
        "spring.jpa.hibernate.ddl-auto=create-drop"
})
class AuthenticationFlowTest {

    @Autowired
    TestRestTemplate rest;

    // JDKのHttpURLConnectionベースのデフォルトファクトリは、POST+401の組み合わせで
    // "cannot retry due to server authentication, in streaming mode" を投げる既知の挙動があるため、
    // Apache HttpClientベースのファクトリに差し替える(ログイン失敗の401を検証するテストに必要)。
    // クライアント側の自動Cookie管理は無効化し、本テストが明示的に引き回すCookieのみが有効になるようにする。
    @BeforeEach
    void useHttpComponentsRequestFactory() {
        CloseableHttpClient httpClient = HttpClientBuilder.create().disableCookieManagement().build();
        rest.getRestTemplate().setRequestFactory(new HttpComponentsClientHttpRequestFactory(httpClient));
    }

    private String sessionCookieFrom(ResponseEntity<?> res) {
        String setCookie = res.getHeaders().getFirst(HttpHeaders.SET_COOKIE);
        assertTrue(setCookie != null && setCookie.contains("JSESSIONID"), "セッションCookieが発行されること: " + setCookie);
        return setCookie.split(";", 2)[0];
    }

    private HttpEntity<Void> cookieEntity(String cookie) {
        HttpHeaders headers = new HttpHeaders();
        if (cookie != null) headers.add(HttpHeaders.COOKIE, cookie);
        return new HttpEntity<>(headers);
    }

    @Test
    void unauthenticatedAccessToGameApiIsRejected() {
        ResponseEntity<Map> res = rest.getForEntity("/api/state", Map.class);
        assertEquals(HttpStatus.UNAUTHORIZED, res.getStatusCode());
    }

    @Test
    void h2ConsoleIsDisabledByDefault() {
        // application.properties で spring.h2.console.enabled=false のため、
        // コンソール用のハンドラ自体が登録されず、未認証アクセスは(anyRequest().authenticated()により)
        // 401で拒否される。少なくともコンソール画面(200)には到達できないことを確認する。
        ResponseEntity<String> res = rest.getForEntity("/h2-console/", String.class);
        assertEquals(HttpStatus.UNAUTHORIZED, res.getStatusCode());
    }

    @Test
    void registerAutoLogsInAndAllowsGameApiAccess() {
        String username = "alice_" + System.nanoTime();
        Dtos.AuthRequest req = new Dtos.AuthRequest(username, "password123");

        ResponseEntity<Dtos.UserDto> registerRes = rest.postForEntity("/api/auth/register", req, Dtos.UserDto.class);
        assertEquals(HttpStatus.OK, registerRes.getStatusCode());
        assertEquals(username, registerRes.getBody().username());
        String cookie = sessionCookieFrom(registerRes);

        // 登録直後は自動ログイン済みで、そのセッションでゲームAPIにアクセスできる(未初期化状態)
        ResponseEntity<Map> stateRes = rest.exchange("/api/state", HttpMethod.GET, cookieEntity(cookie), Map.class);
        assertEquals(HttpStatus.OK, stateRes.getStatusCode());
        assertEquals(Boolean.FALSE, stateRes.getBody().get("initialized"));
    }

    @Test
    void duplicateRegistrationIsRejected() {
        String username = "bob_" + System.nanoTime();
        Dtos.AuthRequest req = new Dtos.AuthRequest(username, "password123");
        assertEquals(HttpStatus.OK, rest.postForEntity("/api/auth/register", req, Dtos.UserDto.class).getStatusCode());
        assertEquals(HttpStatus.BAD_REQUEST, rest.postForEntity("/api/auth/register", req, Dtos.UserDto.class).getStatusCode());
    }

    @Test
    void loginWithCorrectPasswordSucceedsAndWithWrongPasswordIsRejected() {
        String username = "carol_" + System.nanoTime();
        rest.postForEntity("/api/auth/register", new Dtos.AuthRequest(username, "password123"), Dtos.UserDto.class);

        ResponseEntity<Dtos.UserDto> loginRes = rest.postForEntity("/api/auth/login",
                new Dtos.AuthRequest(username, "password123"), Dtos.UserDto.class);
        assertEquals(HttpStatus.OK, loginRes.getStatusCode());
        assertEquals(username, loginRes.getBody().username());

        ResponseEntity<Map> wrongRes = rest.postForEntity("/api/auth/login",
                new Dtos.AuthRequest(username, "wrongpass"), Map.class);
        assertEquals(HttpStatus.UNAUTHORIZED, wrongRes.getStatusCode());
    }

    @Test
    void logoutInvalidatesSessionForGameApi() {
        String username = "dave_" + System.nanoTime();
        ResponseEntity<Dtos.UserDto> registerRes = rest.postForEntity("/api/auth/register",
                new Dtos.AuthRequest(username, "password123"), Dtos.UserDto.class);
        String cookie = sessionCookieFrom(registerRes);

        rest.exchange("/api/auth/logout", HttpMethod.POST, cookieEntity(cookie), Void.class);

        ResponseEntity<Map> res = rest.exchange("/api/state", HttpMethod.GET, cookieEntity(cookie), Map.class);
        assertEquals(HttpStatus.UNAUTHORIZED, res.getStatusCode());
    }

    @Test
    void differentUsersHaveIndependentGameState() {
        String userA = "eve_" + System.nanoTime();
        String userB = "frank_" + System.nanoTime();
        String cookieA = sessionCookieFrom(rest.postForEntity("/api/auth/register",
                new Dtos.AuthRequest(userA, "password123"), Dtos.UserDto.class));
        String cookieB = sessionCookieFrom(rest.postForEntity("/api/auth/register",
                new Dtos.AuthRequest(userB, "password123"), Dtos.UserDto.class));

        rest.exchange("/api/init", HttpMethod.POST,
                new HttpEntity<>(new Dtos.InitRequest("boss", "od", "boss-sd1"), headersWithCookie(cookieA)),
                Dtos.StateDto.class);

        ResponseEntity<Map> stateA = rest.exchange("/api/state", HttpMethod.GET, cookieEntity(cookieA), Map.class);
        ResponseEntity<Map> stateB = rest.exchange("/api/state", HttpMethod.GET, cookieEntity(cookieB), Map.class);

        assertEquals(Boolean.TRUE, stateA.getBody().get("initialized"), "Aは初期化済み");
        assertEquals(Boolean.FALSE, stateB.getBody().get("initialized"), "Bは未初期化(Aと状態が分離されている)");
    }

    private HttpHeaders headersWithCookie(String cookie) {
        HttpHeaders headers = new HttpHeaders();
        headers.add(HttpHeaders.COOKIE, cookie);
        return headers;
    }
}
