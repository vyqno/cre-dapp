// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentBondingCurve} from "../src/AgentBondingCurve.sol";

contract AgentBondingCurveTest is Test {
    AgentBondingCurve public curve;
    address public buyer = address(0xBEEF);
    address public curveAdjuster = address(0xCCCC);

    function setUp() public {
        curve = new AgentBondingCurve("AgentBot1 Shares", "ABS1", 1, 0.0001 ether, 0.00001 ether);
        curve.setCurveAdjuster(curveAdjuster);
        vm.deal(buyer, 100 ether);
    }

    // ─── Core: Buy ─────────────────────────────────

    function test_Buy() public {
        vm.prank(buyer);
        uint256 tokensBought = curve.buy{value: 0.01 ether}();

        assertGt(tokensBought, 0);
        assertEq(curve.balanceOf(buyer), tokensBought);
        assertEq(tokensBought % 1e18, 0);
    }

    function test_BuySendZeroReverts() public {
        vm.prank(buyer);
        vm.expectRevert(AgentBondingCurve.BondingCurve__ZeroETHSent.selector);
        curve.buy{value: 0}();
    }

    function test_BuyRefundsExcessETH() public {
        uint256 balanceBefore = buyer.balance;

        vm.prank(buyer);
        curve.buy{value: 10 ether}();

        uint256 spent = balanceBefore - buyer.balance;
        assertLt(spent, 10 ether);
    }

    // ─── Core: Sell ────────────────────────────────

    function test_Sell() public {
        vm.startPrank(buyer);
        uint256 tokensBought = curve.buy{value: 0.01 ether}();

        uint256 balanceBefore = buyer.balance;
        uint256 sellAmount = (tokensBought / 2 / 1e18) * 1e18;
        curve.sell(sellAmount);
        uint256 balanceAfter = buyer.balance;

        assertGt(balanceAfter, balanceBefore);
        vm.stopPrank();
    }

    function test_SellZeroTokensReverts() public {
        vm.startPrank(buyer);
        curve.buy{value: 1 ether}();
        vm.expectRevert(AgentBondingCurve.BondingCurve__SellBelowMinimum.selector);
        curve.sell(0);
        vm.stopPrank();
    }

    function test_CannotSellMoreThanBalance() public {
        vm.startPrank(buyer);
        curve.buy{value: 0.01 ether}();

        uint256 tooMany = curve.balanceOf(buyer) + 1e18;
        vm.expectRevert(AgentBondingCurve.BondingCurve__InsufficientBalance.selector);
        curve.sell(tooMany);
        vm.stopPrank();
    }

    // ─── Core: Pricing ─────────────────────────────

    function test_PriceIncreasesWithSupply() public {
        uint256 priceBefore = curve.currentPrice();

        vm.prank(buyer);
        curve.buy{value: 1 ether}();

        uint256 priceAfter = curve.currentPrice();
        assertGt(priceAfter, priceBefore);
    }

    // ─── Core: Slope Adjustment ────────────────────

    function test_AdjustSlope() public {
        vm.prank(curveAdjuster);
        curve.adjustSlope(0.00005 ether);

        assertEq(curve.slope(), 0.00005 ether);
    }

    function test_OnlyAdjusterCanChangeSlope() public {
        vm.prank(address(0x9999));
        vm.expectRevert(AgentBondingCurve.BondingCurve__NotAuthorizedAdjuster.selector);
        curve.adjustSlope(0.001 ether);
    }

    function test_SlopeCannotExceedMax() public {
        vm.prank(curveAdjuster);
        vm.expectRevert(AgentBondingCurve.BondingCurve__SlopeExceedsMax.selector);
        curve.adjustSlope(0.02 ether);
    }

    // ─── Reserve Tracking ──────────────────────────

    function test_ReserveTracksCorrectly() public {
        vm.prank(buyer);
        uint256 tokens = curve.buy{value: 1 ether}();

        uint256 reserveAfterBuy = curve.reserveBalance();
        assertGt(reserveAfterBuy, 0);

        vm.prank(buyer);
        curve.sell(tokens);

        assertEq(curve.reserveBalance(), 0);
        assertEq(curve.totalSupply(), 0);
    }

    // ─── Smart Contract Wallet Compatibility ───────

    function test_SmartContractCanBuyAndSell() public {
        BuyerContract buyerContract = new BuyerContract(address(curve));
        vm.deal(address(buyerContract), 10 ether);

        buyerContract.doBuy(1 ether);
        assertGt(curve.balanceOf(address(buyerContract)), 0);

        uint256 tokens = curve.balanceOf(address(buyerContract));
        buyerContract.doSell(tokens);
        assertEq(curve.balanceOf(address(buyerContract)), 0);
    }

    // ─── Multi-step Scenarios ──────────────────────

    function test_BuyAndSellFullCycle() public {
        vm.startPrank(buyer);

        uint256 tokens = curve.buy{value: 5 ether}();
        curve.sell(tokens);

        assertEq(curve.reserveBalance(), 0);
        assertEq(curve.totalSupply(), 0);

        vm.stopPrank();
    }

    function test_MultipleBuyersIndependentBalances() public {
        address buyer2 = address(0xCAFE);
        vm.deal(buyer2, 100 ether);

        vm.prank(buyer);
        uint256 tokens1 = curve.buy{value: 1 ether}();

        vm.prank(buyer2);
        uint256 tokens2 = curve.buy{value: 1 ether}();

        assertGt(tokens1, tokens2);
        assertEq(curve.balanceOf(buyer), tokens1);
        assertEq(curve.balanceOf(buyer2), tokens2);
    }

    function test_SellPartialThenBuyAgain() public {
        vm.startPrank(buyer);

        uint256 tokens = curve.buy{value: 2 ether}();
        uint256 half = (tokens / 2 / 1e18) * 1e18;

        curve.sell(half);
        uint256 remaining = curve.balanceOf(buyer);

        uint256 moreTokens = curve.buy{value: 1 ether}();
        assertEq(curve.balanceOf(buyer), remaining + moreTokens);

        vm.stopPrank();
    }

    // ─── Constructor Validation ────────────────────

    function test_ConstructorRejectsZeroBasePrice() public {
        vm.expectRevert(AgentBondingCurve.BondingCurve__ZeroBasePrice.selector);
        new AgentBondingCurve("Test", "T", 1, 0, 0.00001 ether);
    }

    function test_ConstructorRejectsExcessiveSlope() public {
        vm.expectRevert(AgentBondingCurve.BondingCurve__SlopeExceedsMax.selector);
        new AgentBondingCurve("Test", "T", 1, 0.0001 ether, 0.02 ether);
    }

    // ─── setCurveAdjuster Validation ───────────────

    function test_SetCurveAdjusterRejectsZeroAddress() public {
        vm.expectRevert(AgentBondingCurve.BondingCurve__ZeroAdjusterAddress.selector);
        curve.setCurveAdjuster(address(0));
    }
}

/// @dev Helper contract to test that smart contracts can buy/sell (verifying Address.sendValue works)
contract BuyerContract {
    AgentBondingCurve public curve;

    constructor(address _curve) {
        curve = AgentBondingCurve(_curve);
    }

    function doBuy(uint256 ethAmount) external {
        curve.buy{value: ethAmount}();
    }

    function doSell(uint256 tokens) external {
        curve.sell(tokens);
    }

    receive() external payable {}
}
