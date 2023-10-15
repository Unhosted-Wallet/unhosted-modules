// SPDX-License-Identifier: MIT
/// This is developed and simplified based on HLido.sol by Furucombo

pragma solidity 0.8.17;

import "../BaseHandler.sol";
import "./ILido.sol";

contract LidoHandler is BaseHandler {
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

    function getContractName() public pure override returns (string memory) {
        return "HLido";
    }
}