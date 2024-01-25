pragma solidity ^0.8.0;

import {IEntryPoint} from "I4337/interfaces/IEntryPoint.sol";
import {UserOperation, IAccount} from "I4337/interfaces/IAccount.sol";
import {IVerifyingPaymaster} from "test/interfaces/IVerifyingPaymaster.sol";
import {ENTRYPOINT_0_6_BYTECODE, CREATOR_0_6_BYTECODE} from "I4337/artifacts/EntryPoint_0_6.sol";
import {VERIFYINGPAYMASTER_BYTECODE, VERIFYINGPAYMASTER_ADDRESS} from "test/artifacts/VerifyingPaymasterArtifacts.sol";

import "solady/utils/ECDSA.sol";
import "forge-std/Test.sol";
import "forge-std/console.sol";

import "src/mocks/MockERC20.sol";

uint256 constant OV_FIXED = 21000;
uint256 constant OV_PER_USEROP = 18300;
uint256 constant OV_PER_WORD = 4;
uint256 constant OV_PER_ZERO_BYTE = 4;
uint256 constant OV_PER_NONZERO_BYTE = 16;

abstract contract BiconomyTest is Test {
    IEntryPoint public entryPoint;
    address payable public beneficiary;
    IAccount public account;
    address public owner;
    uint256 public key;
    IVerifyingPaymaster public paymaster;
    address public verifier;
    uint256 public verifierKey;

    function (UserOperation memory) internal view returns(bytes memory) paymasterData;
    function (UserOperation memory) internal view returns(bytes memory) dummyPaymasterData;

    function initializeTest() internal {
        entryPoint = IEntryPoint(payable(address(0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789)));
        vm.etch(address(entryPoint), ENTRYPOINT_0_6_BYTECODE);
        vm.etch(0x7fc98430eAEdbb6070B35B39D798725049088348, CREATOR_0_6_BYTECODE);
        beneficiary = payable(makeAddr("beneficiary"));
        vm.deal(beneficiary, 1e18);
        paymasterData = emptyPaymasterAndData;
        dummyPaymasterData = emptyPaymasterAndData;
        (verifier, verifierKey) = makeAddrAndKey("VERIFIER");
        paymaster = IVerifyingPaymaster(VERIFYINGPAYMASTER_ADDRESS);
        vm.etch(address(paymaster), VERIFYINGPAYMASTER_BYTECODE);
        vm.store(address(paymaster), bytes32(0), bytes32(uint256(uint160(verifier))));
    }

    function setAccount() internal {
        (owner, key) = makeAddrAndKey("Owner");
        account = getAccountAddr(owner);
        vm.deal(address(account), 1e18);
    }

    function getNonce(address account) internal view virtual returns (uint256) {
        return entryPoint.getNonce(account, 0);
    }

    function fillUserOp(bytes memory _data) internal view returns (UserOperation memory op) {
        op.sender = address(account);
        op.nonce = getNonce(address(account));
        if (address(account).code.length == 0) {
            op.initCode = getInitCode(owner);
        }
        op.callData = _data;
        op.callGasLimit = 1000000;
        op.verificationGasLimit = 1000000;
        op.preVerificationGas = 21000;
        op.maxFeePerGas = 1;
        op.maxPriorityFeePerGas = 1;
        op.signature = getDummySig(op);
        op.paymasterAndData = dummyPaymasterData(op);
        op.preVerificationGas = calculatePreVerificationGas(op);
        op.paymasterAndData = paymasterData(op);
        op.signature = getSignature(op);
    }

    function signUserOpHash(uint256 _key, UserOperation memory _op) internal view returns (bytes memory signature) {
        bytes32 hash = entryPoint.getUserOpHash(_op);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(_key, ECDSA.toEthSignedMessageHash(hash));
        signature = abi.encodePacked(r, s, v);
    }

    function executeUserOp(UserOperation memory _op, string memory _test, uint256 _value) internal {
        UserOperation[] memory ops = new UserOperation[](1);
        ops[0] = _op;
        uint256 eth_before;
        if (_op.paymasterAndData.length > 0) {
            eth_before = entryPoint.balanceOf(address(paymaster));
        } else {
            eth_before = entryPoint.balanceOf(address(account)) + address(account).balance;
        }

        entryPoint.handleOps(ops, beneficiary);
        uint256 eth_after;
        if (_op.paymasterAndData.length > 0) {
            eth_after = entryPoint.balanceOf(address(paymaster));
        } else {
            eth_after = entryPoint.balanceOf(address(account)) + address(account).balance + _value;
        }

        console.log("case - %s", _test);
        console.log("  gasUsed       : ", eth_before - eth_after);
        console.log("  calldatacost  : ", calldataCost(pack(_op)));
    }

    function testCreation() internal {
        UserOperation memory op = fillUserOp(fillData(address(0), 0, ""));
        executeUserOp(op, "creation", 0);
    }

    function emptyPaymasterAndData(UserOperation memory _op) internal pure returns (bytes memory ret) {}

    function validatePaymasterAndData(UserOperation memory _op) internal view returns (bytes memory ret) {
        bytes32 hash = paymaster.getHash(_op, 0, 0);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(verifierKey, ECDSA.toEthSignedMessageHash(hash));
        ret = abi.encodePacked(address(paymaster), uint256(0), uint256(0), r, s, uint8(v));
    }

    function getDummyPaymasterAndData(UserOperation memory _op) internal view returns (bytes memory ret) {
        ret = abi.encodePacked(
            address(paymaster),
            uint256(0),
            uint256(0),
            hex"fffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c"
        );
    }

    function pack(UserOperation memory _op) internal pure returns (bytes memory) {
        bytes memory packed = abi.encode(
            _op.sender,
            _op.nonce,
            _op.initCode,
            _op.callData,
            _op.callGasLimit,
            _op.verificationGasLimit,
            _op.preVerificationGas,
            _op.maxFeePerGas,
            _op.maxPriorityFeePerGas,
            _op.paymasterAndData,
            _op.signature
        );
        return packed;
    }

    function calldataCost(bytes memory packed) internal view returns (uint256) {
        uint256 cost = 0;
        for (uint256 i = 0; i < packed.length; i++) {
            if (packed[i] == 0) {
                cost += OV_PER_ZERO_BYTE;
            } else {
                cost += OV_PER_NONZERO_BYTE;
            }
        }
        return cost;
    }

    // NOTE: this can vary depending on the bundler, this equation is referencing eth-infinitism bundler's pvg calculation
    function calculatePreVerificationGas(UserOperation memory _op) internal view returns (uint256) {
        bytes memory packed = pack(_op);
        uint256 calculated = OV_FIXED + OV_PER_USEROP + OV_PER_WORD * (packed.length + 31) / 32;
        calculated += calldataCost(packed);
        return calculated;
    }

    function createAccount(address _owner) internal virtual;

    function getSignature(UserOperation memory _op) internal view virtual returns (bytes memory);

    function getDummySig(UserOperation memory _op) internal pure virtual returns (bytes memory);

    function fillData(address _to, uint256 _amount, bytes memory _data) internal view virtual returns (bytes memory);

    function getAccountAddr(address _owner) internal view virtual returns (IAccount _account);

    function getInitCode(address _owner) internal view virtual returns (bytes memory);
}
