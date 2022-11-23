import httpMethods from 'tradovate-client'
import wsMethods from 'tradovate-socket'

export default (opts = {}) => ({
  ...httpMethods(opts),
  ws: wsMethods(opts),
})