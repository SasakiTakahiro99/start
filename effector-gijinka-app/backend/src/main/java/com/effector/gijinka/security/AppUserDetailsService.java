package com.effector.gijinka.security;

import com.effector.gijinka.model.User;
import com.effector.gijinka.model.UserRepository;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

/** UserRepository を Spring Security の認証に接続する。 */
@Service
public class AppUserDetailsService implements UserDetailsService {

    private final UserRepository userRepo;

    public AppUserDetailsService(UserRepository userRepo) {
        this.userRepo = userRepo;
    }

    @Override
    public UserDetails loadUserByUsername(String username) {
        User u = userRepo.findByUsername(username)
                .orElseThrow(() -> new UsernameNotFoundException("ユーザーが見つかりません: " + username));
        return org.springframework.security.core.userdetails.User
                .withUsername(u.getUsername())
                .password(u.getPasswordHash())
                .authorities("ROLE_USER")
                .build();
    }
}
