window.NotesModal = (function () {
  function ensureRoot() {
    var root = document.getElementById('modal-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'modal-root';
      document.body.appendChild(root);
    }
    return root;
  }

  function close(root) {
    root.classList.remove('modal-open');
    root.innerHTML = '';
  }

  function prompt(message, defaultValue) {
    return new Promise(function (resolve) {
      var root = ensureRoot();
      root.classList.add('modal-open');
      root.innerHTML =
        '<div class="modal-backdrop">' +
        '<div class="modal-box">' +
        '<div class="modal-message"></div>' +
        '<input type="text" class="modal-input" />' +
        '<div class="modal-actions">' +
        '<button class="modal-btn modal-btn-cancel">取消</button>' +
        '<button class="modal-btn modal-btn-ok">確定</button>' +
        '</div></div></div>';

      root.querySelector('.modal-message').textContent = message;
      var input = root.querySelector('.modal-input');
      input.value = defaultValue || '';

      function finish(value) {
        close(root);
        resolve(value);
      }

      root.querySelector('.modal-btn-cancel').addEventListener('click', function () {
        finish(null);
      });
      root.querySelector('.modal-btn-ok').addEventListener('click', function () {
        var v = input.value.trim();
        finish(v || null);
      });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          var v = input.value.trim();
          finish(v || null);
        } else if (e.key === 'Escape') {
          finish(null);
        }
      });

      setTimeout(function () {
        input.focus();
        input.select();
      }, 0);
    });
  }

  function confirmDialog(message) {
    return new Promise(function (resolve) {
      var root = ensureRoot();
      root.classList.add('modal-open');
      root.innerHTML =
        '<div class="modal-backdrop">' +
        '<div class="modal-box">' +
        '<div class="modal-message"></div>' +
        '<div class="modal-actions">' +
        '<button class="modal-btn modal-btn-cancel">取消</button>' +
        '<button class="modal-btn modal-btn-danger">刪除</button>' +
        '</div></div></div>';

      root.querySelector('.modal-message').textContent = message;

      function finish(value) {
        close(root);
        resolve(value);
      }

      root.querySelector('.modal-btn-cancel').addEventListener('click', function () {
        finish(false);
      });
      root.querySelector('.modal-btn-danger').addEventListener('click', function () {
        finish(true);
      });
    });
  }

  function menu(title, options) {
    return new Promise(function (resolve) {
      var root = ensureRoot();
      root.classList.add('modal-open');
      var buttonsHtml = options.map(function (opt, i) {
        return '<button class="modal-btn modal-menu-item" data-idx="' + i + '">' + opt.label + '</button>';
      }).join('');

      root.innerHTML =
        '<div class="modal-backdrop">' +
        '<div class="modal-box">' +
        '<div class="modal-message"></div>' +
        '<div class="modal-menu-list">' + buttonsHtml + '</div>' +
        '<div class="modal-actions">' +
        '<button class="modal-btn modal-btn-cancel">取消</button>' +
        '</div></div></div>';

      root.querySelector('.modal-message').textContent = title;

      function finish(value) {
        close(root);
        resolve(value);
      }

      var items = root.querySelectorAll('.modal-menu-item');
      for (var i = 0; i < items.length; i++) {
        items[i].addEventListener('click', function (e) {
          finish(options[Number(e.currentTarget.dataset.idx)].value);
        });
      }
      root.querySelector('.modal-btn-cancel').addEventListener('click', function () {
        finish(null);
      });
    });
  }

  return {
    prompt: prompt,
    confirm: confirmDialog,
    menu: menu,
  };
})();
