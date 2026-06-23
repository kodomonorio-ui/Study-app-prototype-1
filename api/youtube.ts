const CHANNEL_ID_RE = /^UC[a-zA-Z0-9_-]{22}$/
const CHANNEL_ID_SCAN_RE = /UC[a-zA-Z0-9_-]{22}/
const FEED_URL = 'https://www.youtube.com/feeds/videos.xml'
const YOUTUBE_ORIGIN = 'https://www.youtube.com'
const YOUTUBE_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com']

export default async function handler(req, res) {
  let request = makeRequest(req)
  let response = await handleYoutubeRequest(request)
  let body = await response.text()

  res.statusCode = response.status
  response.headers.forEach((value, key) => {
    res.setHeader(key, value)
  })
  res.end(body)
}

export async function handleYoutubeRequest(request: Request) {
  try {
    let url = new URL(request.url)
    let channelId = url.searchParams.get('channel_id')?.trim() || ''
    let input = url.searchParams.get('input')?.trim() || ''

    if (channelId) {
      return await loadFeed(channelId)
    }

    if (input) {
      return await resolveInput(input)
    }

    return json({ error: 'channel_id or input is required.' }, 400)
  } catch {
    return json({ error: 'YouTube request failed.' }, 502)
  }
}

async function loadFeed(channelId: string) {
  if (!CHANNEL_ID_RE.test(channelId)) {
    return new Response('Invalid channel_id.', { status: 400 })
  }

  let response = await fetchFeed(channelId)

  if (!response.ok) {
    return new Response('YouTube feed was not found for this channel_id.', { status: 404 })
  }

  let xml = await response.text()

  if (!isFeedXml(xml)) {
    return new Response('YouTube did not return a feed for this channel_id.', { status: 502 })
  }

  return new Response(xml, {
    headers: {
      'cache-control': 'public, max-age=300',
      'content-type': 'application/xml; charset=utf-8',
    },
  })
}

async function resolveInput(input: string) {
  let direct = findChannelId(input)

  if (direct) {
    return verifyChannelId(direct)
  }

  let channelUrl = getChannelUrl(input)

  if (!channelUrl) {
    return json({ error: 'YouTube channel URL or @handle is required.' }, 400)
  }

  let response = await fetch(channelUrl, {
    redirect: 'follow',
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'user-agent': 'StudyTube/1.0',
    },
  })

  if (!response.ok) {
    return json({ error: 'Failed to fetch YouTube channel page.' }, 502)
  }

  let html = await response.text()
  let channelId = findPageChannelId(html) || findChannelId(html)

  if (!channelId) {
    return json({ error: 'Could not find a UC... channel ID for this input.' }, 404)
  }

  return verifyChannelId(channelId)
}

async function verifyChannelId(channelId: string) {
  if (!CHANNEL_ID_RE.test(channelId)) {
    return json({ error: 'Invalid YouTube channel ID.' }, 400)
  }

  let response = await fetchFeed(channelId)

  if (!response.ok) {
    return json({ error: 'YouTube RSS was not found for this channel ID. Try the @handle or channel URL.' }, 404)
  }

  let xml = await response.text()

  if (!isFeedXml(xml)) {
    return json({ error: 'YouTube did not return RSS for this channel ID.' }, 502)
  }

  return json({ channelId })
}

async function fetchFeed(channelId: string) {
  let feedUrl = new URL(FEED_URL)
  feedUrl.searchParams.set('channel_id', channelId)

  return fetch(feedUrl, {
    headers: {
      accept: 'application/atom+xml, application/xml;q=0.9, text/xml;q=0.8',
      'user-agent': 'StudyTube/1.0',
    },
  })
}

function getChannelUrl(input: string) {
  let trimmed = input.trim()

  if (trimmed.startsWith('@')) {
    return new URL(`/${trimmed}`, YOUTUBE_ORIGIN).toString()
  }

  if (!hasProtocol(trimmed) && /^((www|m)\.)?youtube\.com\//i.test(trimmed)) {
    trimmed = `https://${trimmed}`
  }

  try {
    let url = new URL(trimmed)

    if (!isYoutubeHost(url.hostname)) {
      return ''
    }

    url.protocol = 'https:'
    url.hash = ''
    return url.toString()
  } catch {
    return ''
  }
}

function findChannelId(value: string) {
  let match = value.match(CHANNEL_ID_SCAN_RE)
  return match && CHANNEL_ID_RE.test(match[0]) ? match[0] : ''
}

function findPageChannelId(html: string) {
  let patterns = [
    /window\['ytCommand'\][\s\S]{0,2000}?"browseEndpoint":\{"browseId":"(UC[a-zA-Z0-9_-]{22})"/,
    /"webPageType":"WEB_PAGE_TYPE_CHANNEL"[\s\S]{0,1000}?"browseEndpoint":\{"browseId":"(UC[a-zA-Z0-9_-]{22})"/,
    /<meta itemprop="channelId" content="(UC[a-zA-Z0-9_-]{22})"/,
    /"channelId":"(UC[a-zA-Z0-9_-]{22})"/,
    /"browseEndpoint":\{"browseId":"(UC[a-zA-Z0-9_-]{22})"/,
  ]

  for (let pattern of patterns) {
    let match = html.match(pattern)

    if (match && CHANNEL_ID_RE.test(match[1])) {
      return match[1]
    }
  }

  return ''
}

function isFeedXml(xml: string) {
  return /<feed[\s>]/.test(xml)
}

function isYoutubeHost(hostname: string) {
  return YOUTUBE_HOSTS.includes(hostname.toLowerCase())
}

function hasProtocol(value: string) {
  return /^https?:\/\//i.test(value)
}

function makeRequest(req) {
  let host = req.headers.host || 'localhost'
  let protocol = req.headers['x-forwarded-proto'] || 'https'
  let url = new URL(req.url || '/api/youtube', `${protocol}://${host}`)

  return new Request(url, {
    method: req.method || 'GET',
  })
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'cache-control': 'public, max-age=300',
      'content-type': 'application/json; charset=utf-8',
    },
  })
}
