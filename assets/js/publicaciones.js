/**
 * Publicaciones - Filtering, Search, and Download Tracking (Firebase)
 *
 * =====================================================================
 * SETUP: Create a Firebase project at https://console.firebase.google.com
 *   1. Create a new project (or use an existing one)
 *   2. Go to Realtime Database > Create Database > Start in test mode
 *   3. Copy your config values into firebaseConfig below
 *   4. (Optional) Set security rules to allow public read + increment only
 * =====================================================================
 */
(function() {
  'use strict';

  // ── Firebase config ── Replace with your own project values ──
  var firebaseConfig = {
    apiKey: "AIzaSyC4_OpQd2cdBW_9kj99j8TE-CTC5vcSCik",
    authDomain: "osiel-publicaciones-prod.firebaseapp.com",
    databaseURL: "https://osiel-publicaciones-prod-default-rtdb.firebaseio.com",
    projectId: "osiel-publicaciones-prod",
    storageBucket: "osiel-publicaciones-prod.firebasestorage.app",
    messagingSenderId: "18960269828",
    appId: "1:18960269828:web:3e677cc99ac67895e26b51"
  };
  // ─────────────────────────────────────────────────────────────

  var db = null;
  var downloadsRef = null;
  var filterClicksRef = null;
  var firebaseReady = false;

  try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.database();
    downloadsRef = db.ref('publicaciones/downloads');
    filterClicksRef = db.ref('publicaciones/filterClicks');
    firebaseReady = true;
  } catch (e) {
    console.warn('Firebase not configured – download counts will use localStorage fallback.', e);
  }

  // ── Helpers ──

  var sortByDownloads = function() {
    var container = document.querySelector('.pub-container');
    if (!container) return;
    var items = Array.from(container.querySelectorAll('.pub-item'));
    items.sort(function(a, b) {
      var countA = parseInt(a.querySelector('.dl-count').textContent) || 0;
      var countB = parseInt(b.querySelector('.dl-count').textContent) || 0;
      return countB - countA;
    });
    items.forEach(function(item) { container.appendChild(item); });
  };

  var updateCountDisplay = function(pubId, count) {
    var el = document.querySelector('.dl-count[data-pub-id="' + pubId + '"]');
    if (el) el.textContent = count;
  };

  // ── Load counts ──

  var loadCountsFromLocal = function() {
    document.querySelectorAll('.dl-count').forEach(function(el) {
      var pubId = el.getAttribute('data-pub-id');
      el.textContent = localStorage.getItem('pub_dl_' + pubId) || '0';
    });
    sortByDownloads();
  };

  var loadCounts = function() {
    if (firebaseReady) {
      var loaded = false;
      var timeout = setTimeout(function() {
        if (!loaded) { loaded = true; loadCountsFromLocal(); }
      }, 3000);
      downloadsRef.on('value', function(snapshot) {
        if (!loaded) { loaded = true; clearTimeout(timeout); }
        var data = snapshot.val() || {};
        document.querySelectorAll('.dl-count').forEach(function(el) {
          var pubId = el.getAttribute('data-pub-id');
          el.textContent = data[pubId] || 0;
        });
        sortByDownloads();
      });
    } else {
      loadCountsFromLocal();
    }
  };

  // ── Increment download ──

  var incrementDownload = function(pubId) {
    if (firebaseReady) {
      var ref = downloadsRef.child(pubId);
      ref.transaction(function(current) {
        return (current || 0) + 1;
      });
    } else {
      var count = parseInt(localStorage.getItem('pub_dl_' + pubId) || '0') + 1;
      localStorage.setItem('pub_dl_' + pubId, count.toString());
      updateCountDisplay(pubId, count);
    }
  };

  // ── Pagination config ──
  var ITEMS_PER_PAGE = 6;
  var currentPage = 1;

  // ── Filter click tracking ──

  var incrementFilterClick = function(tagKey) {
    if (firebaseReady) {
      var ref = filterClicksRef.child(tagKey);
      ref.transaction(function(current) {
        return (current || 0) + 1;
      });
    } else {
      var count = parseInt(localStorage.getItem('pub_fc_' + tagKey) || '0') + 1;
      localStorage.setItem('pub_fc_' + tagKey, count.toString());
    }
  };

  // ── Build dynamic filters from pub-tag spans ──

  var buildFilters = function(callback) {
    var filtersEl = document.getElementById('pub-filters');
    if (!filtersEl) { callback(); return; }

    // Scan all .pub-tag spans to extract unique tags
    var tagMap = {}; // tagKey -> { label, className, count }
    document.querySelectorAll('.pub-item').forEach(function(item) {
      var classes = Array.from(item.classList).filter(function(c) { return c.indexOf('tag-') === 0; });
      item.querySelectorAll('.pub-tag').forEach(function(span, i) {
        var className = classes[i] || '';
        if (!className) return;
        if (!tagMap[className]) {
          tagMap[className] = { label: span.textContent.trim(), className: className, count: 0, clicks: 0 };
        }
        tagMap[className].count++;
      });
    });

    var tagList = Object.keys(tagMap).map(function(k) { return tagMap[k]; });

    var MAX_VISIBLE_TAGS = 5;

    var renderFilters = function(clickData) {
      // Assign click counts
      tagList.forEach(function(t) {
        t.clicks = (clickData && clickData[t.className]) || 0;
      });

      // Sort by clicks descending, then by pub count descending
      tagList.sort(function(a, b) {
        if (b.clicks !== a.clicks) return b.clicks - a.clicks;
        return b.count - a.count;
      });

      // Remove old dynamic filters (keep "Todos")
      Array.from(filtersEl.querySelectorAll('li[data-dynamic]')).forEach(function(el) { el.remove(); });
      var oldDropdown = filtersEl.parentNode.querySelector('.pub-more-dropdown');
      if (oldDropdown) oldDropdown.remove();

      // Top tags as visible buttons
      var visibleTags = tagList.slice(0, MAX_VISIBLE_TAGS);
      var overflowTags = tagList.slice(MAX_VISIBLE_TAGS);

      visibleTags.forEach(function(tag) {
        var li = document.createElement('li');
        li.setAttribute('data-filter', '.' + tag.className);
        li.setAttribute('data-dynamic', 'true');
        li.textContent = tag.label;
        filtersEl.appendChild(li);
      });

      // "Más temas" dropdown for overflow tags
      if (overflowTags.length > 0) {
        var wrapper = document.createElement('div');
        wrapper.className = 'pub-more-dropdown';
        wrapper.style.display = 'inline-block';
        wrapper.style.position = 'relative';

        var toggle = document.createElement('li');
        toggle.className = 'pub-more-toggle';
        toggle.setAttribute('data-dynamic', 'true');
        toggle.innerHTML = 'Más temas <i class="bx bx-chevron-down"></i>';
        wrapper.appendChild(toggle);

        var menu = document.createElement('ul');
        menu.className = 'pub-more-menu';

        overflowTags.forEach(function(tag) {
          var li = document.createElement('li');
          li.setAttribute('data-filter', '.' + tag.className);
          li.textContent = tag.label;
          menu.appendChild(li);
        });

        wrapper.appendChild(menu);
        filtersEl.parentNode.appendChild(wrapper);

        // Toggle dropdown
        toggle.addEventListener('click', function(e) {
          e.stopPropagation();
          menu.classList.toggle('pub-more-open');
        });

        // Close on outside click
        document.addEventListener('click', function() {
          menu.classList.remove('pub-more-open');
        });

        // Select from dropdown
        menu.addEventListener('click', function(e) {
          var li = e.target.closest('li');
          if (!li) return;
          e.stopPropagation();

          // Deactivate all filters, activate this one
          filtersEl.querySelectorAll('li').forEach(function(f) { f.classList.remove('filter-active'); });
          menu.querySelectorAll('li').forEach(function(f) { f.classList.remove('filter-active'); });
          li.classList.add('filter-active');
          toggle.classList.add('filter-active');

          var filterVal = li.getAttribute('data-filter');
          var tagKey = filterVal.replace('.', '');
          incrementFilterClick(tagKey);

          // Dispatch custom event for main filter handler
          filtersEl.dispatchEvent(new CustomEvent('pub-filter-change', { detail: { filter: filterVal } }));
          menu.classList.remove('pub-more-open');
        });
      }

      callback();
    };

    var fallbackToLocal = function() {
      var localClicks = {};
      tagList.forEach(function(t) {
        localClicks[t.className] = parseInt(localStorage.getItem('pub_fc_' + t.className) || '0');
      });
      renderFilters(localClicks);
    };

    if (firebaseReady) {
      var resolved = false;
      var timeout = setTimeout(function() {
        if (!resolved) { resolved = true; fallbackToLocal(); }
      }, 3000);
      filterClicksRef.once('value', function(snapshot) {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          renderFilters(snapshot.val() || {});
        }
      }, function() {
        // Firebase error callback
        if (!resolved) { resolved = true; clearTimeout(timeout); fallbackToLocal(); }
      });
    } else {
      fallbackToLocal();
    }
  };

  // ── Main init ──

  window.addEventListener('load', function() {

    loadCounts();

    // Download button handler
    document.querySelectorAll('.pub-download-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        var pubId = this.getAttribute('data-pub-id');
        var url = this.getAttribute('data-url');

        incrementDownload(pubId);
        window.open(url, '_blank');
      });
    });

    var activeFilter = '*';

    var getFilteredItems = function() {
      var searchInput = document.getElementById('pubSearchInput');
      var searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
      var items = Array.from(document.querySelectorAll('.pub-item'));
      var filtered = [];

      items.forEach(function(item) {
        var matchesFilter = activeFilter === '*' || item.classList.contains(activeFilter.replace('.', ''));
        var title = (item.querySelector('h4') ? item.querySelector('h4').textContent : '').toLowerCase();
        var authors = (item.querySelector('.pub-authors') ? item.querySelector('.pub-authors').textContent : '').toLowerCase();
        var desc = (item.querySelector('.pub-desc') ? item.querySelector('.pub-desc').textContent : '').toLowerCase();
        var tags = (item.querySelector('.pub-tags') ? item.querySelector('.pub-tags').textContent : '').toLowerCase();
        var matchesSearch = !searchTerm || title.indexOf(searchTerm) !== -1 || authors.indexOf(searchTerm) !== -1 || desc.indexOf(searchTerm) !== -1 || tags.indexOf(searchTerm) !== -1;

        if (matchesFilter && matchesSearch) {
          filtered.push(item);
        }
      });

      return filtered;
    };

    var renderPage = function() {
      var allItems = Array.from(document.querySelectorAll('.pub-item'));
      var filtered = getFilteredItems();
      var totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));

      if (currentPage > totalPages) currentPage = totalPages;

      var start = (currentPage - 1) * ITEMS_PER_PAGE;
      var end = start + ITEMS_PER_PAGE;
      var pageItems = filtered.slice(start, end);

      // Hide all, show only current page items
      allItems.forEach(function(item) { item.classList.add('pub-hidden'); });
      pageItems.forEach(function(item) { item.classList.remove('pub-hidden'); });

      // No results message
      var noResults = document.getElementById('pub-no-results');
      if (noResults) {
        noResults.style.display = filtered.length === 0 ? 'block' : 'none';
      }

      // Page info (only show when there are multiple pages)
      var pageInfo = document.getElementById('pub-page-info');
      if (pageInfo && totalPages > 1) {
        pageInfo.textContent = 'Página ' + currentPage + ' de ' + totalPages + ' (' + filtered.length + ' publicaciones)';
      } else if (pageInfo) {
        pageInfo.textContent = '';
      }

      // Render pagination buttons
      var paginationEl = document.querySelector('#pub-pagination .pagination');
      if (!paginationEl) return;
      paginationEl.innerHTML = '';

      if (totalPages <= 1) return;

      // Prev button
      var prevLi = document.createElement('li');
      prevLi.className = 'page-item' + (currentPage === 1 ? ' disabled' : '');
      prevLi.innerHTML = '<a class="page-link" href="#">&laquo;</a>';
      prevLi.addEventListener('click', function(e) {
        e.preventDefault();
        if (currentPage > 1) { currentPage--; renderPage(); scrollToTop(); }
      });
      paginationEl.appendChild(prevLi);

      // Page numbers
      for (var i = 1; i <= totalPages; i++) {
        (function(page) {
          var li = document.createElement('li');
          li.className = 'page-item' + (page === currentPage ? ' active' : '');
          li.innerHTML = '<a class="page-link" href="#">' + page + '</a>';
          li.addEventListener('click', function(e) {
            e.preventDefault();
            currentPage = page;
            renderPage();
            scrollToTop();
          });
          paginationEl.appendChild(li);
        })(i);
      }

      // Next button
      var nextLi = document.createElement('li');
      nextLi.className = 'page-item' + (currentPage === totalPages ? ' disabled' : '');
      nextLi.innerHTML = '<a class="page-link" href="#">&raquo;</a>';
      nextLi.addEventListener('click', function(e) {
        e.preventDefault();
        if (currentPage < totalPages) { currentPage++; renderPage(); scrollToTop(); }
      });
      paginationEl.appendChild(nextLi);
    };

    var scrollToTop = function() {
      var section = document.getElementById('publicaciones');
      if (section) {
        section.scrollIntoView({ behavior: 'smooth' });
      }
    };

    var applyFilters = function() {
      currentPage = 1;
      renderPage();
    };

    var bindFilterEvents = function() {
      var filtersEl = document.getElementById('pub-filters');
      if (!filtersEl) return;

      // Direct click on visible filter buttons
      filtersEl.addEventListener('click', function(e) {
        var li = e.target.closest('li');
        if (!li || li.classList.contains('pub-more-toggle')) return;

        filtersEl.querySelectorAll('li').forEach(function(f) { f.classList.remove('filter-active'); });
        // Also clear dropdown selections
        var dropdownMenu = filtersEl.parentNode.querySelector('.pub-more-menu');
        if (dropdownMenu) dropdownMenu.querySelectorAll('li').forEach(function(f) { f.classList.remove('filter-active'); });
        var moreToggle = filtersEl.parentNode.querySelector('.pub-more-toggle');
        if (moreToggle) moreToggle.classList.remove('filter-active');

        li.classList.add('filter-active');
        activeFilter = li.getAttribute('data-filter');

        // Track click for dynamic sorting (skip "Todos")
        if (activeFilter !== '*') {
          var tagKey = activeFilter.replace('.', '');
          incrementFilterClick(tagKey);
        }

        applyFilters();
      });

      // Selection from "Más temas" dropdown
      filtersEl.addEventListener('pub-filter-change', function(e) {
        activeFilter = e.detail.filter;
        applyFilters();
      });
    };

    // Search input
    var searchInput = document.getElementById('pubSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', applyFilters);
    }

    // Build filters dynamically, then bind events and render
    buildFilters(function() {
      bindFilterEvents();
      renderPage();
    });

  });
})();
