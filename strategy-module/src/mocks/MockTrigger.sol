pragma solidity ^0.8.0;

import "solady/tokens/ERC20.sol";

contract MockTrigger {
    error NotEnoughBalance();

    function hasEnoughBalance(
        address token,
        address account,
        uint256 balance
    ) public view returns (bool) {
        if (ERC20(token).balanceOf(account) < balance) {
            revert NotEnoughBalance();
        }
        return true;
    }
}
