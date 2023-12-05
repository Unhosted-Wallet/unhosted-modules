import {
  arrayify,
  defaultAbiCoder,
  hexDataSlice,
  keccak256,
} from "ethers/lib/utils";
import { BigNumber, Contract, Signer, Wallet } from "ethers";
import { ethers } from "hardhat";
import { AddressZero, callDataCost, rethrow } from "./testUtils";
import { EntryPoint } from "../../typechain";
import { UserOperation } from "./userOperation";

export function packUserOp(op: UserOperation, forSignature = true): string {
  if (forSignature) {
    return defaultAbiCoder.encode(
      [
        "address",
        "uint256",
        "bytes32",
        "bytes32",
        "uint256",
        "uint256",
        "uint256",
        "uint256",
        "uint256",
        "bytes32",
      ],
      [
        op.sender,
        op.nonce,
        keccak256(op.initCode),
        keccak256(op.callData),
        op.callGasLimit,
        op.verificationGasLimit,
        op.preVerificationGas,
        op.maxFeePerGas,
        op.maxPriorityFeePerGas,
        keccak256(op.paymasterAndData),
      ]
    );
  } else {
    // for the purpose of calculating gas cost encode also signature (and no keccak of bytes)
    return defaultAbiCoder.encode(
      [
        "address",
        "uint256",
        "bytes",
        "bytes",
        "uint256",
        "uint256",
        "uint256",
        "uint256",
        "uint256",
        "bytes",
        "bytes",
      ],
      [
        op.sender,
        op.nonce,
        op.initCode,
        op.callData,
        op.callGasLimit,
        op.verificationGasLimit,
        op.preVerificationGas,
        op.maxFeePerGas,
        op.maxPriorityFeePerGas,
        op.paymasterAndData,
        op.signature,
      ]
    );
  }
}

export function getUserOpHash(
  op: UserOperation,
  entryPoint: string,
  chainId: number
): string {
  const userOpHash = keccak256(packUserOp(op, true));
  const enc = defaultAbiCoder.encode(
    ["bytes32", "address", "uint256"],
    [userOpHash, entryPoint, chainId]
  );
  return keccak256(enc);
}

export const DefaultsForUserOp: UserOperation = {
  sender: AddressZero,
  nonce: 0,
  initCode: "0x",
  callData: "0x",
  callGasLimit: 0,
  verificationGasLimit: 250000, // default verification gas. will add create2 cost (3200+200*length) if initCode exists
  preVerificationGas: 21000, // should also cover calldata cost.
  maxFeePerGas: 0,
  maxPriorityFeePerGas: 1e9,
  paymasterAndData: "0x",
  signature: "0x",
};

export function fillUserOpDefaults(
  op: Partial<UserOperation>,
  defaults = DefaultsForUserOp
): UserOperation {
  const partial: any = { ...op };
  // we want "item:undefined" to be used from defaults, and not override defaults, so we must explicitly
  // remove those so "merge" will succeed.
  for (const key in partial) {
    if (partial[key] == null) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete partial[key];
    }
  }
  const filled = { ...defaults, ...partial };
  return filled;
}

// helper to fill structure:
// - default callGasLimit to estimate call from entryPoint to account (TODO: add overhead)
// if there is initCode:
//  - calculate sender by eth_call the deployment code
//  - default verificationGasLimit estimateGas of deployment code plus default 100000
// no initCode:
//  - update nonce from account.getNonce()
// entryPoint param is only required to fill in "sender address when specifying "initCode"
// nonce: assume contract as "getNonce()" function, and fill in.
// sender - only in case of construction: fill sender from initCode.
// callGasLimit: VERY crude estimation (by estimating call to account, and add rough entryPoint overhead
// verificationGasLimit: hard-code default at 100k. should add "create2" cost
export async function fillUserOp(
  op: Partial<UserOperation>,
  entryPoint?: EntryPoint,
  getNonceFunction = "nonce",
  useNonceKey = true,
  nonceKey = 0
): Promise<UserOperation> {
  const op1 = { ...op };
  const provider = entryPoint?.provider;
  if (op.initCode != null) {
    const initAddr = hexDataSlice(op1.initCode!, 0, 20);
    const initCallData = hexDataSlice(op1.initCode!, 20);
    if (op1.nonce == null) op1.nonce = 0;
    if (op1.verificationGasLimit == null) {
      if (provider == null) throw new Error("no entrypoint/provider");
      let initEstimate;
      try {
        initEstimate = await provider.estimateGas({
          from: entryPoint?.address,
          to: initAddr,
          data: initCallData,
          gasLimit: 10e6,
        });
      } catch (error) {
        initEstimate = 1_000_000;
      }
      op1.verificationGasLimit = BigNumber.from(
        DefaultsForUserOp.verificationGasLimit
      ).add(initEstimate);
    }
  }
  if (op1.nonce == null) {
    if (provider == null)
      throw new Error("must have entryPoint to autofill nonce");
    // Review/TODO: if someone passes 'nonce' as nonceFunction. or change the default

    if (useNonceKey) {
      const c = new Contract(
        op.sender!,
        [`function nonce(uint192) view returns(uint256)`],
        provider
      );
      op1.nonce = await c.nonce(nonceKey).catch(rethrow());
    } else {
      const c = new Contract(
        op.sender!,
        [`function ${getNonceFunction}() view returns(uint256)`],
        provider
      );
      op1.nonce = await c[getNonceFunction]().catch(rethrow());
    }
  }
  if (op1.callGasLimit == null && op.callData != null) {
    if (provider == null)
      throw new Error("must have entryPoint for callGasLimit estimate");
    let gasEstimated;
    try {
      gasEstimated = await provider.estimateGas({
        from: entryPoint?.address,
        to: op1.sender,
        data: op1.callData,
      });
    } catch (error) {
      // to handle the case when we need to build an userOp that is expected to fail
      gasEstimated = 3_000_000;
    }

    // console.log('estim', op1.sender,'len=', op1.callData!.length, 'res=', gasEstimated)
    // estimateGas assumes direct call from entryPoint. add wrapper cost.
    op1.callGasLimit = gasEstimated; // .add(55000)
  }
  if (op1.maxFeePerGas == null) {
    if (provider == null)
      throw new Error("must have entryPoint to autofill maxFeePerGas");
    const block = await provider.getBlock("latest");
    op1.maxFeePerGas = block.baseFeePerGas!.add(
      op1.maxPriorityFeePerGas ?? DefaultsForUserOp.maxPriorityFeePerGas
    );
  }
  // TODO: this is exactly what fillUserOp below should do - but it doesn't.
  // adding this manually
  if (op1.maxPriorityFeePerGas == null) {
    op1.maxPriorityFeePerGas = DefaultsForUserOp.maxPriorityFeePerGas;
  }
  const op2 = fillUserOpDefaults(op1);
  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  if (op2.preVerificationGas.toString() === "0") {
    // TODO: we don't add overhead, which is ~21000 for a single TX, but much lower in a batch.
    op2.preVerificationGas = callDataCost(packUserOp(op2, false));
  }
  return op2;
}

export async function fillAndSign(
  op: Partial<UserOperation>,
  signer: Wallet | Signer,
  entryPoint?: EntryPoint,
  getNonceFunction = "nonce",
  useNonceKey = true,
  nonceKey = 0,
  extraPreVerificationGas = 0
): Promise<UserOperation> {
  const provider = entryPoint?.provider;
  const op2 = await fillUserOp(
    op,
    entryPoint,
    getNonceFunction,
    useNonceKey,
    nonceKey
  );
  op2.preVerificationGas =
    Number(op2.preVerificationGas) + extraPreVerificationGas;

  const chainId = await provider!.getNetwork().then((net) => net.chainId);
  const message = arrayify(getUserOpHash(op2, entryPoint!.address, chainId));

  return {
    ...op2,
    signature: await signer.signMessage(message),
  };
}

export async function makeEcdsaModuleUserOp(
  functionName: string,
  functionParams: any,
  userOpSender: string,
  userOpSigner: Signer,
  entryPoint: EntryPoint,
  moduleAddress: string,
  options?: {
    preVerificationGas?: number;
  },
  nonceKey = 0
): Promise<UserOperation> {
  const SmartAccount = await ethers.getContractFactory("SmartAccount");

  const txnDataAA1 = SmartAccount.interface.encodeFunctionData(
    functionName,
    functionParams
  );

  const userOp = await fillAndSign(
    {
      sender: userOpSender,
      callData: txnDataAA1,
      ...options,
    },
    userOpSigner,
    entryPoint,
    "nonce",
    true,
    nonceKey,
    0
  );

  // add validator module address to the signature
  const signatureWithModuleAddress = ethers.utils.defaultAbiCoder.encode(
    ["bytes", "address"],
    [userOp.signature, moduleAddress]
  );

  userOp.signature = signatureWithModuleAddress;
  return userOp;
}

export async function makeExecModuleUserOp(
  functionName: string,
  functionParams: any,
  userOpSender: string,
  userOpSigner: Signer,
  entryPoint: EntryPoint,
  moduleAddress: string,
  options?: {
    preVerificationGas?: number;
  },
  nonceKey = 0
): Promise<UserOperation> {
  const ExecModule = await ethers.getContractFactory("RecurringExecuteModule");

  const txnDataAA1 = ExecModule.interface.encodeFunctionData(
    functionName,
    functionParams
  );

  const userOp = await fillAndSign(
    {
      sender: userOpSender,
      callData: txnDataAA1,
      ...options,
    },
    userOpSigner,
    entryPoint,
    "nonce",
    true,
    nonceKey,
    0
  );

  // add validator module address to the signature
  const signatureWithModuleAddress = ethers.utils.defaultAbiCoder.encode(
    ["bytes", "address"],
    [userOp.signature, moduleAddress]
  );

  userOp.signature = signatureWithModuleAddress;
  return userOp;
}
