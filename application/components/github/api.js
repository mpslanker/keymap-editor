import EventEmitter from 'eventemitter3'
const axios = require('axios')

import * as config from '../../config'

export class API extends EventEmitter {
  token = null
  initialized = false
  installation = null
  repositories = null

  async _request (options) {
    if (typeof options === 'string') {
      options = {
        url: options
      }
    }

    if (options.url.startsWith('/')) {
      options.url = `${config.apiBaseUrl}${options.url}`
    }
  
    options.headers = Object.assign({}, options.headers)
    if (this.token && !options.headers.Authorization) {
      options.headers.Authorization = `Bearer ${this.token}`
    }
    
    try {
      return await axios(options)
    } catch (err) {
      if (err.response?.status === 401) {
        console.error('Authentication failed.')
        this.emit('authentication-failed', err.response)
      }

      throw err
    }
  }

  async init() {
    if (this.initialized) {
      return
    }

    const installationUrl = `${config.apiBaseUrl}/github/installation`
    const param = new URLSearchParams(location.search).get('token')
    if (!localStorage.auth_token && param) {
      history.replaceState({}, null, location.pathname)
      localStorage.auth_token = param
    }

    if (localStorage.auth_token) {
      this.token = localStorage.auth_token
      const { data } = await this._request(installationUrl)
      this.emit('authenticated')

      if (!data.installation) {
        console.warn('No GitHub app installation found for authenticated user.')
        this.emit('app-not-installed')
      }

      this.installation = data.installation
      this.repositories = data.repositories
    }
  }

  beginLoginFlow() {
    localStorage.removeItem('auth_token')
    location.href = `${config.apiBaseUrl}/github/authorize`
  }

  beginInstallAppFlow() {
    location.href = `https://github.com/apps/${config.githubAppName}/installations/new`
  }
  
  isGitHubAuthorized() {
    return !!this.token
  }

  isAppInstalled() {
    return this.installation && this.repositories?.length
  }

  async fetchRepoBranches(repo) {
    const installation = encodeURIComponent(this.installation.id)
    const repository = encodeURIComponent(repo.full_name)
    const { data } = await this._request(
      `/github/installation/${installation}/${repository}/branches`
    )

    return data
  }

  async fetchLayoutAndKeymap(repo, branch) {
    const installation = encodeURIComponent(this.installation.id)
    const repository = encodeURIComponent(repo)
    const url = new URL(`${config.apiBaseUrl}/github/keyboard-files/${installation}/${repository}`)

    if (branch) {
      url.search = new URLSearchParams({ branch }).toString()
    }

    const { status, data } = await this._request(url.toString())

    if (status === 400) {
      console.error('Failed to load keymap and layout from github')
      return data
    }

    const defaultLayout = data.info.layouts.default || data.info.layouts[Object.keys(data.info.layouts)[0]]
    return {
      layout: defaultLayout.layout,
      keymap: data.keymap
    }
  }

  commitChanges(repo, branch, layout, keymap) {
    const installation = encodeURIComponent(this.installation.id)
    const repository = encodeURIComponent(repo)

    return this._request({
      url: `/github/keyboard-files/${installation}/${repository}/${encodeURIComponent(branch)}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: { layout, keymap }
    })
  }
}

export default new API()
