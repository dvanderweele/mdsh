import { createMachine, actions, send, sendParent } from "xstate"
import { getQuickJS, shouldInterruptAfterDeadline, Scope } from "quickjs-emscripten"


/*
  WebShell
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

  WebShell and WebTerminal Interactions
  *************************************

  https://github.com/justjake/quickjs-emscripten 
  * let's use that instead of js-interpreter

  ghostwriter gave me this:

const QuickJS = require('quickjs-runtime');
const runtime = QuickJS.createRuntime();
const context = runtime.createContext();
function executeCommand(command) {
  const result = context.evaluate(command);
  console.log(result);
}
function setVariable(name, value) {
  context.setGlobalObject(name, value);
}
function getVariable(name) {
  return context.getGlobalObject(name);
}
// Example usage
executeCommand('console.log("Hello, world!")'); // Output: Hello, world!
setVariable('name', 'John');
const name = getVariable('name');
console.log(name); // Output: John
context.close();
runtime.dispose();

alternate take:

const { VM } = require('quickjs-emscripten');

// Create a new VM instance
const vm = new VM();

// Cache object to store variables
const cache = {};

// Error handler function
function errorHandler(error) {
  console.error(error);
}

// Function to evaluate a command and store variables
function evaluateCommand(command) {
  try {
    // Evaluate the command in a new context within the runtime
    const result = vm.eval(command);

    // Store the result in the cache
    cache.result = result;

    // Print the result
    console.log(result);
  } catch (error) {
    // Handle any unhandled errors
    errorHandler(error);
  }
}

// Function to retrieve a stored variable
function retrieveVariable(variable) {
  if (variable in cache) {
    console.log(cache[variable]);
  } else {
    console.log(`Variable '${variable}' not found in cache`);
  }
}

// Start the shell loop
function startShell() {
  const readline = require('readline');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> ',
  });

  rl.prompt();

  rl.on('line', (line) => {
    const command = line.trim();

    if (command === 'exit') {
      rl.close();
    } else if (command.startsWith('retrieve ')) {
      // Retrieve a stored variable
      const variable = command.split(' ')[1];
      retrieveVariable(variable);
    } else {
      // Evaluate the command
      evaluateCommand(command);
    }

    rl.prompt();
  }).on('close', () => {
    // Cleanup code here
    process.exit(0);
  });
}

startShell();

  
*/

const { log, assign } = actions

const WebShell = createMachine({
  predictableActionArguments: true,
  initial: "init",
  context: {
    prompt: "🕸️ WebShell 🐚"
  },
  states: {
    init: {
      initial: "awaitingConfig",
      states: {
        awaitingConfig: {
          on: {
            configure: {
              target: "settingUp",
            }
          }
        },
        settingUp: {
          invoke: {
            src: () => () => getQuickJS(),
            onDone: {
              target: "ready",
              actions: [
                assign((ctx, evt) => ({
                  ...ctx,
                  js: evt.data
                })),
                log(ctx => ctx),
                sendParent("shellReady")
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
          invoke: {
            id: "interpreter",
            src: ctx => (clb, onr) => {
              const { js } = ctx
              const globalMap = new Map()
              const getter = (key, vm) => globalCache.get(vm.dump(key)) // bug related to under specified return type - how do we know what type is demanded by calling VM
              const setter = (key, value, vm) => {
                globalCache.set(key, value)
              }
              const outputLogger = (logStr, vm) => {
                console.log(vm.dump(logStr)) 
                const l = vm.dump(logStr)
                if(typeof l === "string") {
                  clb({
                    type: "printOutput",
                    str: l
                  })
                } else {
                  clb({
                    type: "printError",
                    str: `Invalid argument to function "log": provided type "${typeof l}" is not a string.`
                  })
                }
              }
              const errorLogger = (logStr, vm) => {
                const l = vm.dump(logStr)
                if(typeof l === "string") {
                  clb({
                    type: "printError",
                    str: l
                  })
                } else {
                  clb({
                    type: "printError",
                    str: `Invalid argument to function "err": provided type "${typeof l}" is not a string.`
                  })
                }
              }
              globalMap.set("INTERRUPT_AFTER_MS", 5000)
              globalMap.set("INTERRUPT_CYCLES", 1024)
              globalMap.set("INTERRUPT_MODE", "deadline")
              globalMap.set("MEMORY_LIMIT_BYTES", 1024 * 640)
              globalMap.set("MAX_STACK_SIZE_BYTES", 1024 * 320)
              const runtime = js.newRuntime()
              console.log("runtime after instantiation")
              console.log(runtime)
              onr(e => {
                /*
                BUG
                ***
                runtime scope object runtime is referenced inside of onr callback, which means it will be rrferenced at a layer time agyer runtime scope is over. this is the necessity of building ecit keyword into shell, and instead when such happens we manually dipose outer context
                */
                console.log("invoked cb->onr!")
                switch(e.type) {
                  case "exec": {
                    console.log("case exec")
                    Scope.withScope(execScope => {
                      console.log("execScope start")
                      runtime.setMemoryLimit(globalMap.get("MEMORY_LIMIT_BYTES"))
                      runtime.setMaxStackSize(globalMap.get("MAX_STACK_SIZE_BYTES"))
                      console.log("about to gen new ctx")
                      const vm = execScope.manage(runtime.newContext())
                      console.log("just gen new ctx")
                      const outputLoggerCurried = (logStr) => outputLogger(logStr, vm)
                      const errorLoggerCurried = (logStr) => errorLogger(logStr, vm)
                      const logHandle = execScope.manage( vm.newFunction(
                        "log",
                        outputLoggerCurried
                      ))
                      const errHandle = execScope.manage(vm.newFunction(
                        "err",
                        errorLoggerCurried
                      ))
                      const getHandle = execScope.manage(vm.newFunction(
                        "get",
                        getter
                      ))
                      const setHandle = execScope.manage(vm.newFunction(
                        "set",
                        setter
                      ))
                      console.log("about to set prop")
                      vm.setProp(vm.global, "log", logHandle)
                      vm.setProp(vm.global, "err", errHandle)
                      vm.setProp(vm.global, "get", getHandle)
                      vm.setProp(vm.global, "set", setHandle)
                      console.log("just set props")
                      clb("lockInput")
                      console.log("just lockInput")
                      if(globalMap.get("INTERRUPT_MODE") === "deadline"){
                        vm.evalCode(e.command, {
                          shouldInterrupt: shouldInterruptAfterDeadline(Date.now() + globalMap.get("INTERRUPT_AFTER_MS"))
                        })
                      } else {
                        let interruptCycleCounter = 0
                        const interruptAfterCycles = globalMap.get("INTERRUPT_CYCLES")
                        runtime.setInterruptHandler(() => ++interruptCycleCounter > interruptAfterCycles)
                        vm.evalCode(e.command)
                        runtime.removeInterruptHandler()
                      }
                    })
                    console.log("about to unlockInput")
                    clb("unlockInput")
                    break
                  }
                  case "exit": {
                    runtime.dispose()
                    clb("shellRuntimeDisposed")
                    break
                  }
                }
              })
            },
            onError: {
              actions: log((_, evt) => evt)
            }
          },
          on: {
            shellRuntimeDisposed: {
              target: "exit"
            },
            exit: {
              actions: send("exit", {
                to: "interpreter"
              })
            },
            exec: {
              actions: send((_, evt) => evt, {
                to: "interpreter"
              })
            },
            lockInput: {
              actions: sendParent("lockInput")
            },
            unlockInput: {
              actions: sendParent("unlockInput")
            },
            printCommand: {
              actions: sendParent((_, evt) => ({
                type: "printCommand",
                str: evt.command
              }))
            },
            printOutput: {
              actions: sendParent((_, evt) => ({
                type: "printOutput",
                str: evt.output
              }))
            },
            printError: {
              actions: sendParent((_, evt) => ({
                type: "printError",
                str: evt.error
              }))
            },
            prompt: {
              actions: sendParent(ctx => ({
                type: "readPrompt",
                prompt: ctx.prompt
              }))
            },
          }
        },
        paused: {},
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

export default WebShell
