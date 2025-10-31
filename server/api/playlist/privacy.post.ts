import { createRequest } from '../utils/request'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const body = method === 'POST' ? await readBody(event) : {}
  const params = { ...body, ...query }

  try {
    const response = await createRequest(
      'POST',
      'https://music.163.com/weapi/playlist/privacy',
      method === 'GET' ? params : params,
      {
        crypto: 'weapi',
        cookie: params?.cookie || {},
        ua: 'pc'
      }
    )

    return response.body
  } catch (error: any) {
    throw createError({
      statusCode: error.status || 500,
      statusMessage: error.body?.msg || 'Internal Server Error',
      data: error.body
    })
  }
})