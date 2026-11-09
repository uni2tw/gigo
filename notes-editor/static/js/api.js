window.NotesApi = (function () {
  function request(url, options) {
    return fetch(url, options).then(function (res) {
      if (res.status === 204) {
        return null;
      }
      return res.json().catch(function () {
        return {};
      }).then(function (body) {
        if (!res.ok) {
          var err = new Error((body && body.error) || ('Request failed: ' + res.status));
          err.status = res.status;
          throw err;
        }
        return body;
      });
    });
  }

  function getTree() {
    return request('/api/tree', { method: 'GET' });
  }

  function createNode(parent, name, type) {
    return request('/api/nodes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parent: parent, name: name, type: type }),
    });
  }

  function updateNode(path, target) {
    return request('/api/nodes/' + encodeURI(path), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: target }),
    });
  }

  function deleteNode(path, images) {
    var options = { method: 'DELETE' };
    if (images && images.length) {
      options.headers = { 'Content-Type': 'application/json' };
      options.body = JSON.stringify({ images: images });
    }
    return request('/api/nodes/' + encodeURI(path), options);
  }

  function getNote(path) {
    return request('/api/notes/' + encodeURI(path), { method: 'GET' });
  }

  function getNoteMeta(path) {
    return request('/api/notes/' + encodeURI(path) + '/meta', { method: 'GET' });
  }

  function saveNote(path, blocks, expectedUpdatedAt) {
    return request('/api/notes/' + encodeURI(path), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks: blocks, expected_updated_at: expectedUpdatedAt }),
    });
  }

  function versionsUrl(path) {
    return '/api/notes/' + encodeURI(path) + '/versions';
  }

  function listVersions(path) {
    return request(versionsUrl(path), { method: 'GET' });
  }

  function createVersion(path, label, blocks) {
    return request(versionsUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: label, blocks: blocks }),
    });
  }

  function getVersion(path, versionId) {
    return request(versionsUrl(path) + '/' + encodeURIComponent(versionId), { method: 'GET' });
  }

  function deleteVersion(path, versionId) {
    return request(versionsUrl(path) + '/' + encodeURIComponent(versionId), { method: 'DELETE' });
  }

  function restoreVersion(path, versionId, blocks) {
    return request(versionsUrl(path) + '/' + encodeURIComponent(versionId) + '/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks: blocks }),
    });
  }

  function uploadImage(notePath, file) {
    var formData = new FormData();
    formData.append('file', file);
    return request('/api/notes/' + encodeURI(notePath) + '/images', {
      method: 'POST',
      body: formData,
    });
  }

  function fileUrl(relPath) {
    return '/api/files/' + relPath.split('/').map(encodeURIComponent).join('/');
  }

  return {
    getTree: getTree,
    createNode: createNode,
    updateNode: updateNode,
    deleteNode: deleteNode,
    getNote: getNote,
    getNoteMeta: getNoteMeta,
    saveNote: saveNote,
    listVersions: listVersions,
    createVersion: createVersion,
    getVersion: getVersion,
    deleteVersion: deleteVersion,
    restoreVersion: restoreVersion,
    uploadImage: uploadImage,
    fileUrl: fileUrl,
  };
})();
