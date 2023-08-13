import { createMachine, actions, sendTo, raise, sendParent } from "xstate"

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

const EchoShell = createMachine({
  predictableActionArguments: true,
  initial: "init",
  context: {
    prompt: "MDSH"
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
            src: () => Promise.resolve(),
            onDone: {
              target: "ready",
              actions: [
                assign((ctx, evt) => ({
                  ...ctx,
                  js: evt.data
                })),
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
          on: {
            exec: {
              actions: [
                raise((_, evt) => ({
                  type: "printOutput",
                  str: evt.command
                }))
              ]
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
                str: `${
                  evt.str
                }  
***  
                `
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

export default EchoShell
