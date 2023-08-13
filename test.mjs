import { readFile, readdir } from "fs/promises"
import * as esbuild from "esbuild"
import http from "http"

const indexHTML = await readFile(
  "index.html"
)

await esbuild.build(
  {
    entryPoints: [
      "manager.js"
    ],
    outfile: "test.bundle.js",
    minify: true,
    bundle: true,
    loader: {
      ".woff": "file",
      ".woff2": "file"
    }
  }
)

const jsBundle = await readFile(
  "test.bundle.js"
)

const cssBundle = await readFile(
  "test.bundle.css"
)

const files = await readdir(
  "."
)

const fontNames = files.filter(
  n => n.startsWith(
    "fira"
  )
)

const fonts = await Promise.all(
  fontNames.map(
    name => new Promise(
      (res, rej) => {
        readFile(
          name
        ).then(
          contents => {
            res(
              [
                name,
                contents
              ]
            )
          }
        )
      }
    )
  )
)

const fontsMap = new Map(
  fonts
)

http.createServer(
  (
    req, 
    res
  ) => {
    switch(req.url){
      case "/": {
        res.writeHead(
          200,
          {
            "Content-Type": "text/html"
          }
        )
        res.end(
          indexHTML
        )
        break
      }
      case "/test.bundle.js": {
        res.writeHead(
          200,
          {
            "Content-Type": "text/javascript"
          }
        )
        res.end(
          jsBundle
        )
        break
      }
      case "/test.bundle.css": {
        res.writeHead(
          200,
          {
            "Content-Type": "text/css"
          }
        )
        res.end(
          cssBundle
        )
        break
      }
      default: {
        const fontGuess = req.url.slice(
          1
        )
        if(
          fontsMap.has(
            fontGuess
          )
        ){
          res.writeHead(
            200,
            {
              "Content-Type": `font/woff${
                fontGuess.endsWith(
                  2
                ) ? "2" : ""
              }`
            }
          )
          res.end(
            fontsMap.get(
              fontGuess
            )
          )
        } else {
          res.writeHead(
            404,
            {
              "Content-Type": "text/html"
            }
          )
          res.end(
            `Yikes, could not find → ${
              req.url
            }`
          )
        }
      }
    }
  }
).listen(
  8080,
  "localhost"
)

console.log(`

http://localhost:8080/

`)
