// Profil bölməsi funksionallığı
(function() {
    'use strict';
    
    // DOM elementləri
    const profileInfo = document.querySelector('.profile-info');
    const profileDropdown = document.getElementById('profileDropdown');
    const profileUsername = document.getElementById('profileUsername');
    const logoutBtn = document.getElementById('logoutBtn');
    
    // İstifadəçi adını yüklə
    function loadUsername() {
        if (profileUsername) {
            const username = localStorage.getItem('towerDefenseUsername');
            if (username) {
                profileUsername.textContent = username;
            } else {
                profileUsername.textContent = 'İstifadəçi';
            }
        }
    }
    
    // Profil dropdown-u aç/bağla
    function toggleProfileDropdown(e) {
        if (e) {
            e.stopPropagation();
        }
        if (profileDropdown && profileInfo) {
            const isActive = profileDropdown.classList.contains('active');
            closeAllDropdowns();
            if (!isActive) {
                profileDropdown.classList.add('active');
            }
        }
    }
    
    // Bütün dropdown-ları bağla
    function closeAllDropdowns() {
        if (profileDropdown) {
            profileDropdown.classList.remove('active');
        }
    }
    
    // Profil bölməsinə hover effekti
    function initHoverEffects() {
        if (profileInfo && profileDropdown) {
            // Hover ilə açılma
            profileInfo.addEventListener('mouseenter', function(e) {
                e.stopPropagation();
                profileDropdown.classList.add('active');
            });
            
            // Profil bölməsi və dropdown-dan çıxanda bağla
            const profileSection = document.querySelector('.profile-section');
            if (profileSection) {
                profileSection.addEventListener('mouseleave', function() {
                    setTimeout(function() {
                        if (!profileSection.matches(':hover')) {
                            closeAllDropdowns();
                        }
                    }, 100);
                });
            }
        }
    }
    
    // Çıxış funksiyası
    function handleLogout(e) {
        if (e) {
            e.stopPropagation();
            e.preventDefault();
        }
        
        if (confirm('Hesabdan çıxmaq istədiyinizə əminsiniz?')) {
            localStorage.removeItem('towerDefenseLoggedIn');
            localStorage.removeItem('towerDefenseUsername');
            localStorage.removeItem('towerDefenseUserId');
            window.location.href = '/login.html';
        }
    }
    
    // Profili düzəlt funksiyası (gələcək üçün)
    function handleEditProfile(e) {
        if (e) {
            e.stopPropagation();
            e.preventDefault();
        }
        // Gələcək üçün profil redaktə səhifəsi
        alert('Profil redaktə funksionallığı tezliklə əlavə ediləcək.');
    }
    
    // Xaricə klik edəndə bağla
    function initClickOutside() {
        document.addEventListener('click', function(e) {
            const profileSection = document.querySelector('.profile-section');
            if (profileSection && !profileSection.contains(e.target)) {
                closeAllDropdowns();
            }
        });
    }
    
    // İnitializasiya
    function init() {
        loadUsername();
        initHoverEffects();
        initClickOutside();
        
        // Profili düzəlt düyməsi
        const editProfileBtn = document.getElementById('editProfileBtn');
        if (editProfileBtn) {
            editProfileBtn.addEventListener('click', handleEditProfile);
        }
        
        // Çıxış düyməsi
        if (logoutBtn) {
            logoutBtn.addEventListener('click', handleLogout);
        }
    }
    
    // DOM hazır olanda başlat
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

