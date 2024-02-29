pragma solidity 0.8.23;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";


contract MockERC20 is ERC20 {
    function approve(
        address _to,
        uint256 _amount
    ) public override returns (bool) {
        super.approve(_to, _amount);
    }

    function mint(address _to, uint256 _amount) external {
        _mint(_to, _amount);
    }

    function name() public pure override returns (string memory) {
        return "MockERC20";
    }

    function symbol() public pure override returns (string memory) {
        return "MERC20";
    }
}
