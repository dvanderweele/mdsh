import "./style.css"
import "@fontsource/fira-code";
import Terminal from "./terminal.js"
import EchoShell from "./echoShell.js"
import { 
  interpret, 
  createMachine, 
  spawn, 
  sendTo, 
  actions 
} from "xstate"

const { 
  assign, 
  log 
} = actions

const TerminalManager = createMachine({
  predictableActionArguments: true,
  initial: "init",
  context: {
    t: null
  },
  states: {
    init: {
      always: {
        target: "run",
        actions: [
          assign(ctx => ({
            ...ctx,
            t: spawn(
              Terminal,
              "terminal"
            )
          }))
        ]
      }
    },
    run: {
      entry: [
        sendTo(
          "terminal",
          {
            type: "takeConfig",
            rootEl: document.querySelector(
              "#terminal"
            ),
            shell: EchoShell,
            maxOutputEntries: 200,
            maxOutputChars: 10_000,
            maxWriteQueueEntries: 100,
            maxWriteQueueChars: 10_000,
            writeOutputIntervalMs: 30
          }
        )
      ]
    },
    fin: {
      type: "final"
    }
  }
})

const tman = interpret(
  TerminalManager
)
tman.start()
