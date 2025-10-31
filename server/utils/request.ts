import crypto from 'crypto'
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios'
import { PacProxyAgent } from 'pac-proxy-agent'
import http from 'http'
import https from 'https'
import tunnel from 'tunnel'
import fs from 'fs'
import path from 'path'
import { URLSearchParams, URL } from 'url'
import { weapi, linuxapi, eapi, decrypt } from './crypto'

const tmpPath = require('os').tmpdir()
const anonymous_token = fs.readFileSync(
  path.resolve(tmpPath, './anonymous_token'),
  'utf-8',
)

export interface RequestOptions {
  ua?: 'mobile' | 'pc' | boolean
  headers?: Record<string, string>
  cookie?: Record<string, any> | string
  crypto?: 'weapi' | 'linuxapi' | 'eapi'
  proxy?: string
  realIP?: string
  ip?: string
  url?: string
}

export interface RequestResponse {
  status: number
  body: any
  cookie: string[]
}

const chooseUserAgent = (ua: 'mobile' | 'pc' | boolean = false): string => {
  const userAgentMap = {
    mobile:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
    pc: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
  }
  if (ua === 'mobile') {
    return userAgentMap.mobile
  }
  return userAgentMap.pc
}

export const createRequest = (
  method: string,
  url: string,
  data: Record<string, any> = {},
  options: RequestOptions = {}
): Promise<RequestResponse> => {
  return new Promise((resolve, reject) => {
    let headers: Record<string, string> = { 'User-Agent': chooseUserAgent(options.ua) }
    options.headers = options.headers || {}
    headers = {
      ...headers,
      ...options.headers,
    }
    
    if (method.toUpperCase() === 'POST')
      headers['Content-Type'] = 'application/x-www-form-urlencoded'
    if (url.includes('music.163.com'))
      headers['Referer'] = 'https://music.163.com'
      
    let ip = options.realIP || options.ip || ''
    if (ip) {
      headers['X-Real-IP'] = ip
      headers['X-Forwarded-For'] = ip
    }
    
    if (typeof options.cookie === 'object') {
      options.cookie = {
        ...options.cookie,
        __remember_me: true,
        _ntes_nuid: crypto.randomBytes(16).toString('hex'),
      }
      if (url.indexOf('login') === -1) {
        options.cookie['NMTID'] = crypto.randomBytes(16).toString('hex')
      }
      if (!options.cookie.MUSIC_U) {
        // 游客
        if (!options.cookie.MUSIC_A) {
          options.cookie.MUSIC_A = anonymous_token
          options.cookie.os = options.cookie.os || 'ios'
          options.cookie.appver = options.cookie.appver || '8.20.21'
        }
      }
      headers['Cookie'] = Object.keys(options.cookie)
        .map(
          (key) =>
            encodeURIComponent(key) +
            '=' +
            encodeURIComponent(options.cookie[key]),
        )
        .join('; ')
    } else if (options.cookie) {
      headers['Cookie'] = options.cookie
    } else {
      headers['Cookie'] = '__remember_me=true; NMTID=xxx'
    }
    
    if (options.crypto === 'weapi') {
      headers['User-Agent'] =
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36 Edg/116.0.1938.69'
      let csrfToken = (headers['Cookie'] || '').match(/_csrf=([^(;|$)]+)/)
      data.csrf_token = csrfToken ? csrfToken[1] : ''
      data = weapi(data)
      url = url.replace(/\w*api/, 'weapi')
    } else if (options.crypto === 'linuxapi') {
      data = linuxapi({
        method: method,
        url: url.replace(/\w*api/, 'api'),
        params: data,
      })
      headers['User-Agent'] =
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.90 Safari/537.36'
      url = 'https://music.163.com/api/linux/forward'
    } else if (options.crypto === 'eapi') {
      const cookie = options.cookie || {}
      const csrfToken = cookie['__csrf'] || ''
      const header = {
        osver: cookie.osver || '17,1,2',
        deviceId: cookie.deviceId,
        appver: cookie.appver || '8.9.70',
        versioncode: cookie.versioncode || '140',
        mobilename: cookie.mobilename,
        buildver: cookie.buildver || Date.now().toString().substr(0, 10),
        resolution: cookie.resolution || '1920x1080',
        __csrf: csrfToken,
        os: cookie.os || 'ios',
        channel: cookie.channel,
        requestId: `${Date.now()}_${Math.floor(Math.random() * 1000)
          .toString()
          .padStart(4, '0')}`,
      }
      if (cookie.MUSIC_U) header['MUSIC_U'] = cookie.MUSIC_U
      if (cookie.MUSIC_A) header['MUSIC_A'] = cookie.MUSIC_A
      headers['Cookie'] = Object.keys(header)
        .map(
          (key) =>
            encodeURIComponent(key) + '=' + encodeURIComponent(header[key]),
        )
        .join('; ')
      data.header = header
      data = eapi(options.url || url, data)
      url = url.replace(/\w*api/, 'eapi')
    }
    
    const answer: RequestResponse = { status: 500, body: {}, cookie: [] }
    let settings: AxiosRequestConfig = {
      method: method,
      url: url,
      headers: headers,
      data: new URLSearchParams(data).toString(),
      httpAgent: new http.Agent({ keepAlive: true }),
      httpsAgent: new https.Agent({ keepAlive: true }),
    }

    if (options.crypto === 'eapi') settings.encoding = null

    if (options.proxy) {
      if (options.proxy.indexOf('pac') > -1) {
        settings.httpAgent = new PacProxyAgent(options.proxy) as any
        settings.httpsAgent = new PacProxyAgent(options.proxy) as any
      } else {
        const purl = new URL(options.proxy)
        if (purl.hostname) {
          const agent = tunnel[
            purl.protocol === 'https' ? 'httpsOverHttp' : 'httpOverHttp'
          ]({
            proxy: {
              host: purl.hostname,
              port: purl.port || 80,
              proxyAuth:
                purl.username && purl.password
                  ? purl.username + ':' + purl.password
                  : '',
            },
          })
          settings.httpsAgent = agent
          settings.httpAgent = agent
          settings.proxy = false
        } else {
          console.error('代理配置无效,不使用代理')
        }
      }
    } else {
      settings.proxy = false
    }
    
    if (options.crypto === 'eapi') {
      settings = {
        ...settings,
        responseType: 'arraybuffer',
      }
    }
    
    axios(settings)
      .then((res: AxiosResponse) => {
        const body = res.data
        answer.cookie = (res.headers['set-cookie'] || []).map((x: string) =>
          x.replace(/\s*Domain=[^(;|$)]+;*/, ''),
        )
        try {
          if (options.crypto === 'eapi') {
            answer.body = JSON.parse(decrypt(body))
          } else {
            answer.body = body
          }
          if (answer.body.code) {
            answer.body.code = Number(answer.body.code)
          }

          answer.status = Number(answer.body.code || res.status)
          if (
            [201, 302, 400, 502, 800, 801, 802, 803].indexOf(answer.body.code) >
            -1
          ) {
            answer.status = 200
          }
        } catch (e) {
          try {
            answer.body = JSON.parse(body.toString())
          } catch (err) {
            answer.body = body
          }
          answer.status = res.status
        }

        answer.status =
          100 < answer.status && answer.status < 600 ? answer.status : 400
        if (answer.status === 200) resolve(answer)
        else reject(answer)
      })
      .catch((err) => {
        answer.status = 502
        answer.body = { code: 502, msg: err }
        reject(answer)
      })
  })
}

