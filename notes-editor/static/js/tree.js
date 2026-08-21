window.NotesTree = (function () {
  var container = null;
  var onSelect = null;
  var onFolderClick = null;
  var selectedPath = null;
  var currentTree = [];
  var expandedPaths = {};

  function countNotes(node) {
    var count = 0;
    (node.children || []).forEach(function (child) {
      if (child.type === 'note') {
        count += 1;
      } else if (child.type === 'folder') {
        count += countNotes(child);
      }
    });
    return count;
  }

  function init(containerEl, callbacks) {
    container = containerEl;
    onSelect = callbacks.onSelect;
    onFolderClick = callbacks.onFolderClick;

    container.addEventListener('dragover', function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      container.classList.add('drag-over-root');
    });
    container.addEventListener('dragleave', function (e) {
      if (e.target === container) {
        container.classList.remove('drag-over-root');
      }
    });
    container.addEventListener('drop', function (e) {
      e.preventDefault();
      container.classList.remove('drag-over-root');
      var sourcePath = e.dataTransfer.getData('text/plain');
      handleDropOnRoot(sourcePath);
    });
  }

  function setTree(newTree) {
    currentTree = newTree;
    render();
  }

  function setSelected(path) {
    selectedPath = path;
    render();
  }

  function render() {
    container.innerHTML = '';
    container.appendChild(renderNodes(currentTree));
  }

  function renderNodes(nodes) {
    var wrapper = document.createElement('div');
    nodes.forEach(function (node) {
      wrapper.appendChild(renderNode(node));
    });
    return wrapper;
  }

  function renderNode(node) {
    var el = document.createElement('div');
    el.className = 'tree-node';

    var row = document.createElement('div');
    row.className = 'tree-node-row' + (node.path === selectedPath ? ' selected' : '');

    var toggle = document.createElement('span');
    toggle.className = 'tree-toggle';
    var hasChildren = node.type === 'folder' && node.children && node.children.length > 0;

    var isExpanded = !!expandedPaths[node.path];
    if (node.type === 'folder') {
      toggle.textContent = hasChildren ? (isExpanded ? '▾' : '▸') : '';
    } else {
      toggle.textContent = '';
    }

    var icon = document.createElement('span');
    icon.className = 'tree-node-icon';
    icon.textContent = node.type === 'folder' ? '📁' : '📄';

    var label = document.createElement('span');
    label.className = 'tree-node-label';
    label.textContent = node.name;

    row.appendChild(toggle);
    row.appendChild(icon);
    row.appendChild(label);

    if (node.type === 'folder') {
      var noteCount = countNotes(node);
      if (noteCount > 0) {
        var countBadge = document.createElement('span');
        countBadge.className = 'tree-node-count';
        countBadge.textContent = String(noteCount);
        row.appendChild(countBadge);
      }
    }

    row.addEventListener('click', function () {
      if (node.type === 'folder') {
        expandedPaths[node.path] = !expandedPaths[node.path];
        render();
        if (onFolderClick) {
          onFolderClick(node);
        }
      } else if (onSelect) {
        onSelect(node);
      }
    });

    row.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      showContextMenu(node);
    });

    row.draggable = true;
    row.addEventListener('dragstart', function (e) {
      e.dataTransfer.setData('text/plain', node.path);
      e.dataTransfer.effectAllowed = 'move';
      row.classList.add('dragging');
    });
    row.addEventListener('dragend', function () {
      row.classList.remove('dragging');
    });

    if (node.type === 'folder') {
      row.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        row.classList.add('drag-over');
      });
      row.addEventListener('dragleave', function () {
        row.classList.remove('drag-over');
      });
      row.addEventListener('drop', function (e) {
        e.preventDefault();
        e.stopPropagation();
        row.classList.remove('drag-over');
        var sourcePath = e.dataTransfer.getData('text/plain');
        handleDropOnFolder(sourcePath, node);
      });
    }

    el.appendChild(row);

    if (node.type === 'folder' && isExpanded && node.children) {
      var childrenEl = document.createElement('div');
      childrenEl.className = 'tree-node-children';
      childrenEl.appendChild(renderNodes(node.children));
      el.appendChild(childrenEl);
    }

    return el;
  }

  function showContextMenu(node) {
    window.NotesModal.menu('節點：' + node.name, [
      { label: '重新命名', value: 'rename' },
      { label: '搬移', value: 'move' },
      { label: '刪除', value: 'delete' },
    ]).then(function (action) {
      if (action === 'rename') {
        handleRename(node);
      } else if (action === 'delete') {
        handleDelete(node);
      } else if (action === 'move') {
        handleMove(node);
      }
    });
  }

  function parentDirOf(path) {
    var parts = path.split('/');
    parts.pop();
    return parts.join('/');
  }

  function basenameOf(path) {
    var parts = path.split('/');
    return parts[parts.length - 1];
  }

  function performMove(sourcePath, newPath) {
    window.NotesApi.updateNode(sourcePath, newPath)
      .then(function () {
        window.NotesApp.onNodeMoved(sourcePath, newPath);
      })
      .catch(function (err) {
        window.alert(err.message);
      });
  }

  function handleDropOnFolder(sourcePath, targetFolder) {
    if (!sourcePath) {
      return;
    }
    var newPath = (targetFolder.path ? targetFolder.path + '/' : '') + basenameOf(sourcePath);
    if (newPath === sourcePath || sourcePath === targetFolder.path) {
      return;
    }
    performMove(sourcePath, newPath);
  }

  function handleDropOnRoot(sourcePath) {
    if (!sourcePath) {
      return;
    }
    var newPath = basenameOf(sourcePath);
    if (newPath === sourcePath) {
      return;
    }
    performMove(sourcePath, newPath);
  }

  function handleRename(node) {
    window.NotesModal.prompt('輸入新名稱', node.name).then(function (newName) {
      if (!newName || newName === node.name) {
        return;
      }
      var parentDir = parentDirOf(node.path);
      var ext = node.type === 'note' ? '.md' : '';
      var newPath = (parentDir ? parentDir + '/' : '') + newName + ext;
      performMove(node.path, newPath);
    });
  }

  function handleDelete(node) {
    window.NotesModal.confirm('確定要刪除「' + node.name + '」嗎？此操作無法復原。').then(function (ok) {
      if (!ok) {
        return;
      }
      window.NotesApi.deleteNode(node.path)
        .then(function () {
          window.NotesApp.onNodeDeleted(node.path);
        })
        .catch(function (err) {
          window.alert(err.message);
        });
    });
  }

  function handleMove(node) {
    window.NotesModal.prompt('輸入目標路徑（相對於筆記根目錄）', node.path).then(function (targetPath) {
      if (!targetPath || targetPath === node.path) {
        return;
      }
      performMove(node.path, targetPath);
    });
  }

  return {
    init: init,
    setTree: setTree,
    setSelected: setSelected,
  };
})();
