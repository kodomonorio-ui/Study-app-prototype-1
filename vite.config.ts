import { reactRouter } from '@react-router/dev/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { handleYoutubeRequest } from './api/youtube'

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [youtubeApi(), reactRouter(), tailwindcss()],
})

function youtubeApi() {
  return {
    name: 'studytube-youtube-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/youtube')) {
          next()
          return
        }

        let origin = `http://${req.headers.host || 'localhost'}`
        let request = new Request(new URL(req.url, origin), {
          method: req.method || 'GET',
        })
        let response = await handleYoutubeRequest(request)
        let body = await response.text()

        res.statusCode = response.status
        response.headers.forEach((value, key) => {
          res.setHeader(key, value)
        })
        res.end(body)
      })
    },
  }
}
