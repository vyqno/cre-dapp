// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {BondingCurveFactory} from "../src/BondingCurveFactory.sol";
import {AgentBondingCurve} from "../src/AgentBondingCurve.sol";

contract BondingCurveFactoryTest is Test {
    BondingCurveFactory public factory;

    function setUp() public {
        factory = new BondingCurveFactory(0.0001 ether, 0.00001 ether);
    }

    function test_CreateCurve() public {
        address curveAddr = factory.createCurve(1, "Bot1 Shares", "BOT1");

        AgentBondingCurve curve = AgentBondingCurve(curveAddr);
        assertEq(curve.agentId(), 1);
        assertEq(curve.basePrice(), 0.0001 ether);
    }

    function test_GetCurveForAgent() public {
        address curveAddr = factory.createCurve(1, "Bot1 Shares", "BOT1");
        assertEq(factory.getCurve(1), curveAddr);
    }

    function test_CannotCreateDuplicate() public {
        factory.createCurve(1, "Bot1 Shares", "BOT1");
        vm.expectRevert(BondingCurveFactory.Factory__CurveAlreadyExists.selector);
        factory.createCurve(1, "Bot1 Shares", "BOT1");
    }

    function test_GetAllAgentIds() public {
        factory.createCurve(1, "Bot1", "B1");
        factory.createCurve(2, "Bot2", "B2");
        factory.createCurve(3, "Bot3", "B3");

        uint256[] memory ids = factory.getAllAgentIds();
        assertEq(ids.length, 3);
        assertEq(ids[0], 1);
        assertEq(ids[2], 3);
    }

    function test_ConstructorRejectsZeroBasePrice() public {
        vm.expectRevert(BondingCurveFactory.Factory__ZeroBasePrice.selector);
        new BondingCurveFactory(0, 0.00001 ether);
    }

    function test_ConstructorRejectsExcessiveSlope() public {
        vm.expectRevert(BondingCurveFactory.Factory__SlopeExceedsMax.selector);
        new BondingCurveFactory(0.0001 ether, 0.02 ether);
    }

    function test_nonOwnerCannotCreateCurve() public {
        address nonOwner = address(0xBEEF);
        vm.prank(nonOwner);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", nonOwner));
        factory.createCurve(99, "Test", "TST");
    }
}
