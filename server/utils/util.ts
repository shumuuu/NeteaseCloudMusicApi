export const toBoolean = (val: any): boolean => {
  if (typeof val === 'boolean') return val
  if (val === '') return val
  return val === 'true' || val == '1'
}

export const cookieToJson = (cookie: string): Record<string, string> => {
  if (!cookie) return {}
  const cookieArr = cookie.split(';')
  const obj: Record<string, string> = {}
  cookieArr.forEach((i) => {
    const arr = i.split('=')
    obj[arr[0]] = arr[1]
  })
  return obj
}

export const getRandom = (num: number): number => {
  const random = Math.floor(
    (Math.random() + Math.floor(Math.random() * 9 + 1)) *
      Math.pow(10, num - 1),
  )
  return random
}

