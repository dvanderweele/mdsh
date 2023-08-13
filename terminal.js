import { createMachine, actions, sendTo, spawn } from "xstate"
import mdToElements from "@dvanderweele/smarked"
/*
  WebTerminal
  ********

  * Intended for use as an actor, not a service.
  * Don't invoke with context.
  * Do send "takeConfig" event with required data after spawning:
    * rootEl: Empty DOMElement to contain all component DOMElements created by this machine. This will be destroyed when this actor completes its lifecycle.
    * maxOutputEntries: max output lines to allow in output channel
    * maxOutputChars: max output characters to allow in output channel; this and entries limit must both be satisfied if write is to occur to outputChannel, else oldest entries are purged one by one until both conditions are satisfied, and then write can occur.
    * maxHistoryEntries: max shell history entries to allow, older entries are purged first if necessary. history is persisted before commands are executed.

  https://mattcasmith.net/2022/02/22/bash-history-basics-behaviours-forensics

https://unix.stackexchange.com/questions/145250/where-is-bashs-history-stored

***********
*         *
*         *
*         *
*         *
*         *
***********
***********
***********

buttons:
* top row:
  * skipUp
  * skipDown
  * historyBack
  * historyForward
  * clearInput
* bottom row: 
  * 4 arrow keys

status bar:
* cols 1-5 = prompt/cwd
* col 6 = exit button


we need to decide (a) parameter(s) for limiting terminal's writeQueue size. above a certain size, the queue should throw away the input, else enqueue. the queue should be limited both by characters and entries, just like mounted DOM elements in output.

the queue is polled at a frequent interval for rendering.

Pending Features
****************
* password/secret entry mode

*/

const { log, assign, choose } = actions

const Terminal = createMachine({
  predictableActionArguments: true,
  initial: "init",
  context: {
    writeQueueCharsTally: 0,
    outputCharsTally: 0,
    output: {
      writeQueue: []
    }
  },
  states: {
    init: {
      initial: "awaitingConfig",
      states: {
        awaitingConfig: {
          on: {
            takeConfig: {
              target: "settingUp",
              actions: [
                assign((ctx, evt) => ({
                  ...ctx,
                  rootEl: evt.rootEl,
                  shell: spawn(
                    evt.shell,
                    "shell"
                  ),
                  maxWriteQueueEntries: evt.maxWriteQueueEntries,
                  maxWriteQueueChars: evt.maxWriteQueueChars,
                  writeOutputIntervalMs: evt.writeOutputIntervalMs,
                  maxOutputEntries: evt.maxOutputEntries,
                  maxOutputChars: evt.maxOutputChars
                }))
              ]
            }
          }
        },
        settingUp: {
          always: {
            target: "awaitingShellReady",
            actions: [
              assign(ctx => {
                const statusChannel = document.createElement("div")
                const outputChannel = document.createElement("div")
                const inputChannel = document.createElement("div")
                const exit = document.createElement("button")
                exit.innerText = "Exit"
                const prompt = document.createElement("p")
                const entries = document.createElement("div")
                const skipUp = document.createElement("button")
                skipUp.innerText = "Jump to Top"
                const skipDown = document.createElement("button")
                skipDown.innerText = "Jump to Bottom"
                const historyBack = document.createElement("button")
                historyBack.innerText = "History Back"
                const historyForward = document.createElement("button")
                historyForward.innerText = "History Forward"
                const clearInput = document.createElement("button")
                clearInput.innerText = "Clear Input"
                const textInput = document.createElement("textarea")
                textInput.placeholder = "Enter command…"
                textInput.disabled = true
                textInput.autocapitalize = "off"
                const enter = document.createElement("button")
                enter.innerText = "✓"
                const buttons = document.createElement("div")
                outputChannel.append(entries)
                statusChannel.append(exit, prompt)
                buttons.append(skipUp, skipDown, clearInput, historyBack, historyForward)
                inputChannel.append(textInput, enter, buttons)
                ctx.rootEl.append(statusChannel, outputChannel, inputChannel)
                return {
                  ...ctx,
                  statusChannel,
                  outputChannel,
                  inputChannel,
                  status: {
                    prompt,
                    exit
                  },
                  output: {
                    numEntries: 0,
                    writeQueue: [],
                    entries
                  },
                  buttons: {
                    skipUp, 
                    skipDown, 
                    clearInput, 
                    historyBack, 
                    historyForward
                  },
                  input: {
                    textInput,
                    enter,
                    buttons
                  }
                }
              }),
              sendTo(
                "shell",
                {
                  type: "configure"
                }
              )
            ]
          }
        },
        awaitingShellReady: {
          on: {
            shellReady: {
              target: "ready",
              actions: [
                ctx => { ctx.input.textInput.disabled = false }
              ]
            }
          }
        },
        ready: { 
          type: "final"
        }
      },
      onDone: "run"
    },
    run: {
      initial: "running",
      states: {
        running: {
          /*
            behaviors to categorize:
            * callback invocations for button listeners
            * callback invocations for keystroke listeners
            * selective element enable/disablement
            * textarea cursor management
            * shell input
            * shell output

            lockable behaviors:
            * text input
            * command submission

            unlockable behaviors:
            * output reception
            * output parsing
            * output writing
            * output navigation
            * kill job
            * exit
          */
          entry: ctx => ctx.input.textInput.focus(),
          type: "parallel",
          states: {
            lockable: {
              initial: "unlocked",
              states: {
                unlocked: {
                  type: "parallel",
                  on: {
                    lockInput: "locked"
                  },
                  states: {
                    textInput: {
                      type: "parallel",
                      states: {
                        watch: {
                          invoke: {
                            src: ctx => () => {
                              const clear = () => {
                                ctx.input.textInput.value = ""
                                ctx.input.textInput.focus()
                              }
                              ctx.buttons.clearInput.addEventListener("click", clear)
                              return () => {
                                ctx.buttons.clearInput.removeEventListener("click", clear)
                              }
                            }
                          }
                        },
                        respond: {}
                      }
                    },
                    commandSubmission: {
                      type: "parallel",
                      states: {
                        watch: {
                          invoke: {
                            src: ctx => clb => {
                              //const enterBtn
                              const enterBtn = e => {
                                clb("commandEnter")
                              }
                              //const enterKey
                              const enterKey = e => {
                                if(e.key === "Enter"){
                                  e.preventDefault()
                                  ctx.input.textInput.value += "\n"
                                  return
                                }
                              }
                              ctx.input.enter.addEventListener(
                                "click", 
                                enterBtn
                              )
                              ctx.input.textInput.addEventListener(
                                "keydown", 
                                enterKey
                              )
                              return () => {
                                ctx.input.enter.removeEventListener(
                                  "click", 
                                  enterBtn
                                )
                                ctx.input.textInput.removeEventListener(
                                  "keydown", 
                                  enterKey
                                )
                              }
                            }
                          }
                        },
                        respond: {
                          on: {
                            commandEnter: {
                              actions: [
                                assign(ctx => ({
                                  ...ctx,
                                  cachedCommand: ctx.input.textInput.value
                                })),
                                ctx => {
                                  ctx.input.textInput.value = ""
                                  ctx.input.textInput.focus()
                                },
                                sendTo(
                                  "shell",
                                  ctx => ({
                                    type: "exec",
                                    command: ctx.cachedCommand
                                  })
                                )
                              ]
                            }
                          }
                        }
                      }
                    }
                  }
                },
                locked: {
                  entry: [
                    ctx => {
                      ctx.input.textInput.disabled = true
                      ctx.input.enter.disabled = true
                    }
                  ],
                  on: {
                    unlockInput: {
                      target: "unlocked",
                      actions: ctx => {
                        ctx.input.textInput.disabled = false
                        ctx.input.enter.disabled = false
                        ctx.input.textInput.focus()
                        
                      }
                    }
                  }
                },
                fin: {
                  type: "final"
                }
              }
            },
            unlockable: {
              type: "parallel",
              states: {
                outputReception: {
                  on: {
                    printCommand: {
                      actions: [
                        choose([
                          {
                            cond: (ctx, evt) => ctx.output.writeQueue.length + 1 < ctx.maxWriteQueueEntries && ctx.writeQueueCharsTally + evt.str.length < ctx.maxWriteQueueChars,
                            actions: [
                              assign((ctx, evt) => ({
                                ...ctx,
                                output: {
                                  ...ctx.output,
                                  writeQueue: [
                                    ...ctx.output.writeQueue,
                                    {
                                      els: mdToEpements(
                                        evt.str
                                      ),
                                      mdLength: evt.str.length,
                                      type: "cmd"
                                    }
                                  ]
                                }
                              }))
                            ]
                          }
                        ])
                      ]
                    },
                    printOutput: {
                      actions: [
                        log((_, evt) => evt),
                        choose([
                          {
                            cond: (ctx, evt) => ctx.output.writeQueue.length + 1 < ctx.maxWriteQueueEntries && ctx.writeQueueCharsTally + evt.str.length < ctx.maxWriteQueueChars,
                            actions: [
                              assign((ctx, evt) => ({
                                ...ctx,
                                output: {
                                  ...ctx.output,
                                  writeQueue: [
                                    ...ctx.output.writeQueue,
                                    {
                                      els: mdToElements(
                                        evt.str
                                      ),
                                      mdLength: evt.str.length,
                                      type: "txt"
                                    }
                                  ]
                                }
                              }))
                            ]
                          }
                        ])
                      ]
                    }
                  }
                },
                outputParsing: {
                  
                },
                outputWriting: {
                  type: "parallel",
                  states: {
                    watching: {
                      invoke: {
                        src: ctx => clb => {
                          const i = setInterval(() => {
                            clb("render")
                          }, ctx.writeOutputIntervalMs)
                          return () => {
                            clearInterval(i)
                          }
                        }
                      }
                    },
                    responding: {
                      on: {
                        render: {
                          actions: [
                            assign(ctx => {
                              // trim entries buffer
                              if(
                                ctx.output.writeQueue.length > 0
                              ){
                                const e = ctx.output.entries

                                const o = ctx.output.writeQueue.shift()
                                const oldElCt = ctx.output.numEntries
                                const newElCt = o.els.length
                                let newEntryCt = oldElCt
                                if(oldElCt + newElCt >= ctx.maxOutputEntries){

                                  let deletions = Math.max(
                                    1,
                                    ctx.maxOutputEntries - (oldElCt + newElCt)
                                  )
                                  newEntryCt -= deletions
                                  while(deletions){
                                    e.removeChild(
                                      e.firstChild
                                    )
                                    deletions--
                                  }
                                }
                                newEntryCt += newElCt
                                e.append(
                                  ...o.els
                                )
                                e.children[e.children.length - 1] ? e.children[e.children.length - 1].scrollIntoView() : e.scrollIntoView()
                                return {
                                  ...ctx,
                                  output: {
                                    ...ctx.output,
                                    writeQueue: ctx.output.writeQueue,
                                    numEntries: newEntryCt
                                  }
                                }
                              } else {
                                return ctx
                              }
                            })
                          ]
                        }
                      }
                    }
                  }
                },
                outputNavigation: {
                  invoke: {
                    src: ctx => clb => {
                      const up = e => {
                        e.preventDefault()
                        const n = ctx.output.entries
                        if(n.firstChild){
                          n.firstChild.scrollIntoView()
                        }
                      }
                      const down = e => {
                        e.preventDefault()
                        const n = ctx.output.entries
                        if(typeof n.children[n.children.length - 1] !== "undefined" && n.children[n.children.length - 1]){
                          n.children[n.children.length - 1].scrollIntoView()
                        }
                      }
                      ctx.buttons.skipUp.addEventListener("click", up)
                      ctx.buttons.skipDown.addEventListener("click", down)
                      return () => {
                        ctx.buttons.skipUp.removeEventListener("click", up)
                        ctx.buttons.skipDown.removeEventListener("click", down)
                      }
                    }
                  }
                },
                jobKilling: {
                  
                },
                exit: {
                  
                }
              }
            }
          },
          onDone: [
            {
              cond: (_, evt) => evt.type === "pause",
              target: "paused"
            },
            {
              target: "exit"
            }
          ]
        },
        paused: {
          on: { 
            resume: "running"
          }
        },
        exit: {
          type: "final"
        }
      },
      onDone: "fin"
    },
    fin: {
      type: "final"
    }
  }
})

export default Terminal
