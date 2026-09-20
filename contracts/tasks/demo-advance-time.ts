import { task, types } from "hardhat/config";

task("demo:advance-time", "Advance the Hardhat network time by a given number of seconds and mine a block")
  .addParam("seconds", "Number of seconds to advance", undefined, types.int)
  .setAction(async ({ seconds }, { ethers, network }) => {
    // Only allow execution on local development networks
    const isLocalNetwork =
      network.name === "hardhat" ||
      network.name === "localhost" ||
      network.name === "127.0.0.1" ||
      network.config.chainId === 31337 ||
      network.config.chainId === 1337;

    if (!isLocalNetwork) {
      throw new Error(
        `demo:advance-time is restricted to local development networks (current network: "${network.name}"). ` +
        `Refusing to execute time manipulation on non-local network.`
      );
    }

    if (seconds <= 0) {
      throw new Error("seconds must be a positive integer");
    }

    await network.provider.send("evm_increaseTime", [seconds]);
    await network.provider.send("evm_mine");

    const latestBlock = await ethers.provider.getBlock("latest");
    console.log(`Time advanced by ${seconds} seconds.`);
    console.log(`New block number: ${latestBlock?.number}`);
    console.log(`New block timestamp: ${latestBlock?.timestamp} (${new Date((latestBlock?.timestamp ?? 0) * 1000).toISOString()})`);
  });
