// Importing libraries:
const { ethers } = require('ethers'); // A library for interacting with the Ethereum blockchain
const colors = require('colors'); // A library for color manipulation and conversion
const fs = require('fs'); // Providing an API for interacting with the file system 
const readlineSync = require('readline-sync'); // Providing synchronous methods for reading input from the command line.

// Importing scripts from /src folder:
const checkBalance = require('./src/checkBalance'); // Importing the balance check script file
const displayHeader = require('./src/displayHeader'); // mporting the display header script file (The first lines you see when you run the script)
const sleep = require('./src/sleep'); // mporting the sleep script file 

const rpcUrl = 'https://rpc-testnet.unit0.dev'; // Defining the RPC(Remote Procedure Call) URL

const MAX_RETRIES = 5;  // The max amount of retries if the transaction faild
const RETRY_DELAY = 5000; // The time between each retries in ms


//Error handler:
async function retry(fn, maxRetries = MAX_RETRIES, delay = RETRY_DELAY) { 
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) { // Ss
      if (i === maxRetries - 1) throw error; // Returning the error
      console.log(
        colors.yellow(`Error occurred. Retrying... (${i + 1}/${maxRetries})`)
      );
      await sleep(delay); //Delay before retrying
    }
  }
}

//Main function:
const main = async () => {
  displayHeader(); //Showing the header imported from /src file

  const privateKeys = JSON.parse(fs.readFileSync('privateKeys.json')); //Getting the private keys from the json file added by the user. The sender(s) private key

  const provider = new ethers.JsonRpcProvider(rpcUrl); // Connecting to an Ethereum node using the JSON-RPC protocol

  // Creating wallet addresses for all of the private keys in the json file
  for (const privateKey of privateKeys) {
    const wallet = new ethers.Wallet(privateKey, provider); //Creating a new wallet for the private key provided
    const senderAddress = wallet.address; //Saving the wallet address

    console.log(
      colors.cyan(`Processing transactions for address: ${senderAddress}`)
    );


    // Error handler for checking the balances of the wallets 
    let senderBalance;
    try {
      senderBalance = await retry(() => checkBalance(provider, senderAddress)); // Saving the balacne of the wallet
    } catch (error) {
      console.log(
        colors.red(
          `Failed to check balance for ${senderAddress}. Skipping to next address.`
        )
      );
      continue;
    }

    // Checking if the wallet has enough balance 
    if (senderBalance < ethers.parseUnits('0.01', 'ether')) {
      console.log(
        colors.red('Insufficient or zero balance. Skipping to next address.')
      );
      continue;
    }

    // Updating the wallet balance and showing it to the user
    let continuePrintingBalance = true;
    const printSenderBalance = async () => {
      while (continuePrintingBalance) { // Loop for showing the balance
        try {
          senderBalance = await retry(() =>
            checkBalance(provider, senderAddress) //Checking the balance
          );
          console.log(
            colors.blue( //Printing out the balance to the user
              `Current Balance: ${ethers.formatUnits( //Converting the unit from the smallest denomination (wei)
                senderBalance,
                'ether'
              )} ETH`
            )
          ); 

            // Checking if the wallet has enough balance 
            if (senderBalance < ethers.parseUnits('0.01', 'ether')) {
            console.log(colors.red('Insufficient balance for transactions.'));
            continuePrintingBalance = false; // Stopping the loop of showing the balance
          }
        } catch (error) {
          console.log(colors.red(`Failed to check balance: ${error.message}`));
        }
        await sleep(RETRY_DELAY); // Waiting for RETRY_DELAY 
      }
    };

    printSenderBalance();

    const transactionCount = readlineSync.questionInt( // Creating a varibale for the number of transactions 
      `Enter the number of transactions you want to send for address ${senderAddress}: `
    );

    for (let i = 1; i <= transactionCount; i++) { // Loop for doing the transaction till reaching the limit
      const receiverWallet = ethers.Wallet.createRandom(); // Creating a random wallet 
      const receiverAddress = receiverWallet.address; // Saving the address of the random wallet
      console.log(colors.white(`\nGenerated address ${i}: ${receiverAddress}`)); // Showing the transaction count (i) and the generated address to the user

      const amountToSend = ethers.parseUnits( // Calculating a random amount to send, convert human-readable representations into wei
        (Math.random() * (0.0000001 - 0.00000001) + 0.00000001) // Min to send: 0.00000001 ether
          .toFixed(10)
          .toString(),
        'ether'
      );

      const gasPrice = ethers.parseUnits( //Calculating the gas price
        (Math.random() * (0.0015 - 0.0009) + 0.0009).toFixed(9).toString(),
        'gwei'
      );

      const transaction = { // Template for each transaction to show to the user
        to: receiverAddress,
        value: amountToSend,
        gasLimit: 21000,
        gasPrice: gasPrice,
        chainId: 88817,
      };

      //Transaction and its error handler:
      let tx;
      try {
        tx = await retry(() => wallet.sendTransaction(transaction));
      } catch (error) {
        console.log(colors.red(`Failed to send transaction: ${error.message}`));
        continue;
      }

      //Showing the resulats of the transaction to the user
      console.log(colors.white(`Transaction ${i}:`));
      console.log(colors.white(`  Hash: ${colors.green(tx.hash)}`));
      console.log(colors.white(`  From: ${colors.green(senderAddress)}`));
      console.log(colors.white(`  To: ${colors.green(receiverAddress)}`));
      console.log(
        colors.white(
          `  Amount: ${colors.green( 
            ethers.formatUnits(amountToSend, 'ether') //Converting the sent ammount to "ethher" unit
          )} ETH`
        )
      );
      console.log(
        colors.white(
          `  Gas Price: ${colors.green(
            ethers.formatUnits(gasPrice, 'gwei') //Converting the sent ammount to "gwei" unit
          )} Gwei`
        )
      );

      console.log(`${colors.cyan("----wait----")}`);
      await sleep(15000);

      let receipt;
      try {
        receipt = await retry(() => provider.getTransactionReceipt(tx.hash)); // Getting the transaction receipt
        if (receipt) { // Checking if the transaction receipt exicts
          if (receipt.status === 1) { // status 1 means transaction was successful
            console.log(colors.green('Transaction  !'));
            console.log(colors.green(`  Block Number: ${receipt.blockNumber}`)); //Showing the block number to the user
            console.log(
              colors.green(`  Gas Used: ${receipt.gasUsed.toString()}`) //Showing the gas used to the user
            );
          } else {
            console.log(colors.red('Transaction FAILED'));
          }
        } else {
          console.log(
            colors.yellow(
              'Transaction is still pending after multiple retries.'
            )
          );
        }
      } catch (error) { // If the transaction was not successful after retries
        console.log(
          colors.red(`Error checking transaction status: ${error.message}`) // Showint the transaction error to the user
        );
      }

      console.log();
    }

    console.log(
      colors.green(`Finished transactions for address: ${senderAddress}`) // Showing the randomly generated address
    );
  }
};

main().catch((error) => {
  console.error(colors.red('An unexpected error occurred:'), error);
});
