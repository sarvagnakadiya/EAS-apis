const express = require("express");
const {
  SchemaEncoder,
  SchemaRegistry,
  createOffchainURL,
  EAS,
  Delegated,
  ZERO_BYTES32,
  NO_EXPIRATION,
} = require("@ethereum-attestation-service/eas-sdk");
const { ethers } = require("ethers");
const dotenv = require("dotenv");
const { stringToBytes, bytesToHex } = require("viem");
const bodyParser = require("body-parser");
const axios = require("axios");
const abi = require("./EAS.json").abi;
const resolver_abi = require("./AttesterResolver.json").abi;

const app = express();
app.use(bodyParser.json());
const port = 3003;
dotenv.config();

const url = process.env.RPC_URL;

// Set up your ethers provider and signer
const provider = new ethers.JsonRpcProvider(url, undefined, {
  staticNetwork: true,
});
const privateKey = process.env.PVT_KEY;
const signer = new ethers.Wallet(privateKey, provider);

const EASContractAddress = "0x4200000000000000000000000000000000000021";

const schemaUID =
  "0xf9e214a80b66125cad64453abe4cef5263be3a7f01760d0cc72789236fca2b5d";

BigInt.prototype.toJSON = function () {
  return this.toString();
};

app.post("/attestOffchain", async (req, res) => {
  const eas = new EAS(EASContractAddress);
  eas.connect(signer);
  const { recipient, meetingId, meetingType, startTime, endTime } = req.body;
  if (typeof recipient !== "string" || typeof meetingId !== "string") {
    return res
      .status(400)
      .json({ error: "Recipient and meetingId must be strings." });
  } else if (
    typeof meetingType !== "number" ||
    typeof startTime !== "number" ||
    typeof endTime !== "number"
  ) {
    return res
      .status(400)
      .json({ error: "MeetingType, startTime, and endTime must be numbers." });
  } else if (meetingType < 0 || meetingType > 5) {
    return res
      .status(400)
      .json({ error: "MeetingType must be a number between 0 and 5." });
  }
  try {
    const offchain = await eas.getOffchain();
    const schemaEncoder = new SchemaEncoder(
      "bytes32 MeetingId,uint8 MeetingType,uint32 StartTime,uint32 EndTime"
    );

    const encodedData = schemaEncoder.encodeData([
      {
        name: "MeetingId",
        value: bytesToHex(stringToBytes(meetingId), { size: 32 }),
        type: "bytes32",
      },
      { name: "MeetingType", value: meetingType, type: "uint8" },
      { name: "StartTime", value: startTime, type: "uint32" },
      { name: "EndTime", value: endTime, type: "uint32" },
    ]);

    // Convert BigInt values to strings
    const expirationTime = BigInt(0);
    const currentTime = BigInt(Math.floor(Date.now() / 1000));
    console.log(typeof currentTime);

    const offchainAttestation = await offchain.signOffchainAttestation(
      {
        schema: schemaUID,
        recipient: recipient,
        time: currentTime,
        expirationTime: expirationTime,
        revocable: false,
        refUID:
          "0x0000000000000000000000000000000000000000000000000000000000000000",
        data: encodedData,
      },
      signer
    );

    const pkg = {
      sig: offchainAttestation,
      signer: await signer.getAddress(),
    };

    const baseUrl = "https://optimism.easscan.org/";
    const url = baseUrl + createOffchainURL(pkg);

    const data = {
      filename: `eas.txt`,
      textJson: JSON.stringify(pkg),
    };

    let uploadstatus;
    try {
      response = await axios.post(`${baseUrl}/offchain/store`, data);
      if (response.data) {
        uploadstatus = true;
      }
      console.log(response.data);
    } catch (error) {
      console.error("Error submitting signed attestation: ", error);
      throw error;
    }

    res.json({ success: true, offchainAttestation, url, uploadstatus });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/attestOnchain", async (req, res) => {
  const eas = new EAS(EASContractAddress);
  eas.connect(signer);
  const { recipient, meetingId, meetingType, startTime, endTime } = req.body;
  if (typeof recipient !== "string" || typeof meetingId !== "string") {
    return res
      .status(400)
      .json({ error: "Recipient and meetingId must be strings." });
  } else if (
    typeof meetingType !== "number" ||
    typeof startTime !== "number" ||
    typeof endTime !== "number"
  ) {
    return res
      .status(400)
      .json({ error: "MeetingType, startTime, and endTime must be numbers." });
  } else if (meetingType < 0 || meetingType > 5) {
    return res
      .status(400)
      .json({ error: "MeetingType must be a number between 0 and 5." });
  }
  try {
    const schemaEncoder = new SchemaEncoder(
      "bytes32 MeetingId,uint8 MeetingType,uint32 StartTime,uint32 EndTime"
    );

    const encodedData = schemaEncoder.encodeData([
      {
        name: "MeetingId",
        value: bytesToHex(stringToBytes(meetingId), { size: 32 }),
        type: "bytes32",
      },
      { name: "MeetingType", value: meetingType, type: "uint8" },
      { name: "StartTime", value: startTime, type: "uint32" },
      { name: "EndTime", value: endTime, type: "uint32" },
    ]);

    const tx = await eas.attest({
      schema: schemaUID,
      data: {
        recipient: recipient,
        expirationTime: 0,
        revocable: false,
        data: encodedData,
      },
      gasPrice: 1000000,
      //   gasLimit: 300000,
    });

    const newAttestationUID = await tx.wait();

    console.log("New attestation UID: ", newAttestationUID);

    res.json({ success: true, newAttestationUID });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/delegateAttestationOnchain", async (req, res) => {
  const { recipient, meetingId, meetingType, startTime, endTime } = req.body;
  if (typeof recipient !== "string" || typeof meetingId !== "string") {
    return res
      .status(400)
      .json({ error: "Recipient and meetingId must be strings." });
  } else if (
    typeof meetingType !== "number" ||
    typeof startTime !== "number" ||
    typeof endTime !== "number"
  ) {
    return res
      .status(400)
      .json({ error: "MeetingType, startTime, and endTime must be numbers." });
  } else if (meetingType < 0 || meetingType > 5) {
    return res
      .status(400)
      .json({ error: "MeetingType must be a number between 0 and 5." });
  }
  try {
    const schemaEncoder = new SchemaEncoder(
      "bytes32 MeetingId,uint8 MeetingType,uint32 StartTime,uint32 EndTime"
    );

    const encodedData = schemaEncoder.encodeData([
      {
        name: "MeetingId",
        value: bytesToHex(stringToBytes(meetingId), { size: 32 }),
        type: "bytes32",
      },
      { name: "MeetingType", value: meetingType, type: "uint8" },
      { name: "StartTime", value: startTime, type: "uint32" },
      { name: "EndTime", value: endTime, type: "uint32" },
    ]);

    try {
      const eas = new EAS(EASContractAddress);
      const signerUser = new ethers.Wallet(process.env.USER_PVT_KEY, provider);

      eas.connect(signer);
      console.log("connected");
      //   Use this delegated if you want to go manual
      //   const delegated = new Delegated({
      //     address: EASContractAddress,
      //     chainId: BigInt(11155420),
      //     version: "1.0.2",
      //   });
      const delegated = await eas.getDelegated();
      console.log(delegated);

      console.log("delegated obj: ", delegated);
      console.log("siginig attestation...");

      //   console.log("the nonce", await eas.getNonce(signer.address));
      const delegatedAttestation = await delegated.signDelegatedAttestation(
        {
          schema: schemaUID,
          recipient: recipient,
          expirationTime: NO_EXPIRATION,
          revocable: false,
          refUID: ZERO_BYTES32,
          data: encodedData,
          nonce: await eas.getNonce(signer.address),
        },
        signer
      );

      console.log("delegatedAttestation: ", delegatedAttestation);
      console.log("verifying...");
      const verify = await delegated.verifyDelegatedAttestationSignature(
        await signer.getAddress(),
        delegatedAttestation
      );
      console.log("verify obj: ", verify);

      const tx = await eas.connect(signerUser).attestByDelegation({
        schema: schemaUID,
        data: {
          recipient: delegatedAttestation.message.recipient,
          expirationTime: delegatedAttestation.message.expirationTime,
          revocable: delegatedAttestation.message.revocable,
          refUID: delegatedAttestation.message.refUID,
          data: encodedData,
        },
        signature: delegatedAttestation.signature,
        attester: signer.address,
      });
      const newAttestationUID = await tx.wait();
      console.log("New attestation UID: ", newAttestationUID);
      res.json({ success: true, newAttestationUID });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/registerSchema", async (req, res) => {
  const { schemaRegistryContractAddress, resolverAddress } = req.body;

  const eas = new EAS(EASContractAddress);
  eas.connect(signer);
  try {
    const schemaRegistry = new SchemaRegistry(schemaRegistryContractAddress);
    schemaRegistry.connect(signer);

    const schema =
      "bytes32 meetingId, uint8 meetingType, uint32 startTime, uint32 endTime";

    // pass this if you don't want to add customResolverAddress
    // const resolverAddress = "0x0000000000000000000000000000000000000000";
    const revocable = false;

    const transaction = await schemaRegistry.register({
      schema,
      resolverAddress,
      revocable,
      gasPrice: 1000000,
    });
    // console.log(transaction);

    const hash = await transaction.wait();
    console.log("the schema UID", hash);

    res.json({ success: true, transaction, hash });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/directCall", async (req, res) => {
  const { recipient, meetingId, meetingType, startTime, endTime } = req.body;
  if (typeof recipient !== "string" || typeof meetingId !== "string") {
    return res
      .status(400)
      .json({ error: "Recipient and meetingId must be strings." });
  } else if (
    typeof meetingType !== "number" ||
    typeof startTime !== "number" ||
    typeof endTime !== "number"
  ) {
    return res
      .status(400)
      .json({ error: "MeetingType, startTime, and endTime must be numbers." });
  } else if (meetingType < 0 || meetingType > 5) {
    return res
      .status(400)
      .json({ error: "MeetingType must be a number between 0 and 5." });
  }
  //data   ----START
  const schemaEncoder = new SchemaEncoder(
    "bytes32 MeetingId,uint8 MeetingType,uint32 StartTime,uint32 EndTime"
  );

  const encodedData = schemaEncoder.encodeData([
    {
      name: "MeetingId",
      value: bytesToHex(stringToBytes(meetingId), { size: 32 }),
      type: "bytes32",
    },
    { name: "MeetingType", value: meetingType, type: "uint8" },
    { name: "StartTime", value: startTime, type: "uint32" },
    { name: "EndTime", value: endTime, type: "uint32" },
  ]);

  //data   ----END

  const eas = new EAS(EASContractAddress);
  eas.connect(signer);
  const signerUser = new ethers.Wallet(process.env.USER_PVT_KEY, provider);
  const contract = new ethers.Contract(EASContractAddress, abi, signerUser);
  console.log("the signer user:", signerUser);
  console.log("the signer admin: ", signer);

  eas.connect(signer);
  console.log("connected to EAS");

  const delegated = await eas.getDelegated();

  console.log("delegated obj", delegated);

  console.log("siginig attestation...");

  const delegatedAttestation = await delegated.signDelegatedAttestation(
    {
      schema: schemaUID,
      recipient: recipient,
      expirationTime: NO_EXPIRATION,
      revocable: false,
      refUID: ZERO_BYTES32,
      data: encodedData,
      value: BigInt(0),
      deadline: NO_EXPIRATION,
      nonce: await eas.getNonce(signer.address),
    },
    signer
  );
  console.log("signed Object:", delegatedAttestation);

  const tupleObject = {
    schema: delegatedAttestation.message.schema,
    data: {
      recipient: delegatedAttestation.message.recipient,
      data: delegatedAttestation.message.data,
      expirationTime: delegatedAttestation.message.expirationTime,
      revocable: delegatedAttestation.message.revocable,
      refUID: delegatedAttestation.message.refUID,
      value: 0n,
      nonce: delegatedAttestation.message.nonce,
    },
    signature: {
      v: delegatedAttestation.signature.v,
      r: delegatedAttestation.signature.r,
      s: delegatedAttestation.signature.s,
    },
    attester: signer.address,
    deadline: 0n,
  };
  console.log("the tuple:", tupleObject);

  console.log("transaction being sent...");

  const tx = await contract.attestByDelegation(tupleObject, {
    gasLimit: 3000000,
  });
  console.log(tx);
  console.log("transaction sent successfully...");
  res.json({ success: true, tx });
});

app.post("/changeTargetAttester", async (req, res) => {
  const { newTargetAttester } = req.body;
  const signerUser = new ethers.Wallet(process.env.USER_PVT_KEY, provider);

  console.log(newTargetAttester);
  const contract = new ethers.Contract(
    "0x8beE4e979b31a52ad82dec1B089c14541056b0A5",
    resolver_abi,
    signerUser
  );
  const txChangeOwner = await contract.updateTargetAttester(newTargetAttester);

  res.json({ success: true, txHash: txChangeOwner.hash });
});

app.post("/revokeOffchain", async (req, res) => {
  const { UID } = req.body;
  const eas = new EAS(EASContractAddress);
  eas.connect(signer);

  const data = ethers.encodeBytes32String(
    "0xbed159b097d9b267ea7acae8e8d9c66b642d89eacb59c2cb8bbc3445e8edd54d"
  );
  console.log(data);

  const transaction = await eas.revokeOffchain(data);
  console.log(transaction);

  await transaction.wait();
  res.json({ success: true, txHash: transaction });
});
app.post("/revokeOnchain", async (req, res) => {
  const { UID } = req.body;
  const eas = new EAS(EASContractAddress);
  eas.connect(signer);

  const transaction = await eas.revoke({
    schema: schemaUID,
    data: {
      uid: UID,
    },
  });

  // Optional: Wait for transaction to be validated
  await transaction.wait();
  res.json({ success: true, txHash: transaction });
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
