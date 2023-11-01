// SPDX-License-Identifier: MIT
/// This is developed and simplified based on HLido.sol by Furucombo

pragma solidity 0.8.20;

import {BaseHandler} from "contracts/handlers/BaseHandler.sol";
import {ILido} from "contracts/handlers/lido/ILido.sol";
import {ILidoHandler} from "contracts/handlers/lido/ILidoH.sol";

contract LidoHandler is BaseHandler, ILidoHandler {
    address public immutable referral;
    ILido public immutable lidoProxy;

    constructor(address lidoProxy_, address referral_) {
        referral = referral_;
        lidoProxy = ILido(lidoProxy_);
    }

    function submit(
        uint256 value
    ) external payable returns (uint256 stTokenAmount) {
        value = _getBalance(NATIVE_TOKEN_ADDRESS, value);

        try lidoProxy.submit{value: value}(referral) returns (
            uint256 sharesAmount
        ) {
            stTokenAmount = lidoProxy.getPooledEthByShares(sharesAmount);
        } catch Error(string memory reason) {
            _revertMsg("submit", reason);
        } catch {
            _revertMsg("submit");
        }
    }

    function getContractName()
        public
        pure
        virtual
        override
        returns (string memory)
    {
        return "HLido";
    }
}
