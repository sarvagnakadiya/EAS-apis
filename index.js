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
// const EASContractAddress = "0x4200000000000000000000000000000000000021";
// const eas = new EAS(EASContractAddress);
// eas.connect(signer);

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
      "bytes16 MeetingId,uint8 MeetingType,uint32 StartTime,uint32 EndTime"
    );

    const encodedData = schemaEncoder.encodeData([
      {
        name: "MeetingId",
        value: bytesToHex(stringToBytes(meetingId), { size: 16 }),
        type: "bytes16",
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
        // schema:
        //   "0xfabbfe80a9120eb3d709b8f72a6cc186ad1da170e19660c1c22f695f2f5c7eee",
        schema:
          "0xb8ff8ae05f706119287ed047b92de57f45f1e3520150c1af8155b26da8ff94d6",
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

    const baseUrl = "https://optimism-sepolia.easscan.org";
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

    // console.log(encodedData);

    const schemaUID =
      "0xb8ff8ae05f706119287ed047b92de57f45f1e3520150c1af8155b26da8ff94d6";
    // const schemaUID =
    //   "0xb8ff8ae05f706119287ed047b92de57f45f1e3520150c1af8155b26da8ff94d6";

    const tx = await eas.attest({
      schema: schemaUID,
      data: {
        recipient: recipient,
        expirationTime: 0,
        revocable: false,
        data: encodedData,
      },
      gasLimit: 300000,
    });

    const newAttestationUID = await tx.wait();

    console.log("New attestation UID:", newAttestationUID);

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

    console.log(bytesToHex(stringToBytes(meetingId), { size: 32 }));

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
    const schemaUID =
      "0xb8ff8ae05f706119287ed047b92de57f45f1e3520150c1af8155b26da8ff94d6";

    try {
      const eas = new EAS(
        EASContractAddress,
        "0x37AC6006646f2e687B7fB379F549Dc7634dF5b84"
      );
      const signerUser = new ethers.Wallet(process.env.USER_PVT_KEY, provider);
      console.log("thesigner", signerUser);

      eas.connect(signer);
      //   const delegated = new Delegated({
      //     address: ,
      //     chainId: BigInt(11155420),
      //     version: "1.3.0",
      //   });
      console.log("hi");
      const gett = eas.getEIP712Proxy();
      console.log("the proxy", gett); // it is returning undefined everytime
      const delegated = await eas.getDelegated();

      console.log("delegated obj", delegated);
      //   console.log("the nonce", await eas.getNonce(signer.address));
      console.log("signing atttestation ...");

      const delegatedAttestation = await delegated.signDelegatedAttestation(
        {
          schema: schemaUID,
          recipient: recipient,
          expirationTime: NO_EXPIRATION,
          revocable: false,
          refUID: ZERO_BYTES32,
          data: encodedData,
          value: BigInt(0),
          deadline: BigInt(0),
          nonce: await eas.getNonce(signer.address),
        },
        signer
      );

      console.log(delegatedAttestation);

      //   console.log(
      //     "delegatedAttestation: (signed obj):  ",
      //     delegatedAttestation
      //   );
      //   console.log("verifying...");
      //   const verify = await delegated.verifyDelegatedAttestationSignature(
      //     await signer.getAddress(),
      //     delegatedAttestation
      //   );
      //   console.log("verify obj", verify);
      console.log("wallet.address", signerUser.address);

      const tx = await eas.connect(signerUser).attestByDelegationProxy({
        schema: schemaUID,
        data: {
          recipient: recipient,
          data: encodedData,
          expirationTime: NO_EXPIRATION,
          revocable: false,
          refUID: ZERO_BYTES32,
          value: BigInt(0),
        },
        signature: delegatedAttestation.signature,
        attester: "0x8dEa0ad941d577e356745d758b30Fa11EFa28E80",
        deadline: BigInt(0),
      });
      const newAttestationUID = await tx.wait();
      console.log("New attestation UID:", newAttestationUID);
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
  const eas = new EAS(
    EASContractAddress,
    "0x37AC6006646f2e687B7fB379F549Dc7634dF5b84"
  );
  eas.connect(signer);
  try {
    const schemaRegistryContractAddress =
      "0x4200000000000000000000000000000000000020";
    const schemaRegistry = new SchemaRegistry(schemaRegistryContractAddress);
    schemaRegistry.connect(signer);

    const schema =
      "bytes32 meetingId, uint8 meetingType, uint32 startTime, uint32 endTime";
    const resolverAddress = "0x0000000000000000000000000000000000000000";
    const revocable = false;

    const transaction = await schemaRegistry.register({
      schema,
      resolverAddress,
      revocable,
      gasLimit: 3000000,
    });
    // console.log(transaction);

    // Optional: Wait for transaction to be validated
    const hash = await transaction.wait();
    console.log("the schema UID", hash);

    res.json({ success: true, transaction, hash });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
