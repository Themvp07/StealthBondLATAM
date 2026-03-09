// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @title BondVault
/// @notice Custodian contract reflecting the collateral deposit guaranteed by a TEE.
/// @dev Only the CRE Oracle can update metadata and mint RWAs on MultiChain.
contract BondVault {
    address public creForwarder;

    struct BondMetadata {
        uint256 totalNominalValue;
        uint256 underlyingAssetAmount; // Liquid backups
        bytes32 confidentialHash; // IPFS/DON Vault Data. Hidden private conditions
        address issuerWallet;
        address tokenContract;
        bool isActive;
        string chainDestination; // For CCIP (Sepolia, Arbitrum Sepolia)
    }

    // Mapping by commercial paper / RWA ID
    mapping(uint256 => BondMetadata) public bonds;
    uint256 public nextBondId = 1;

    event BondMintedMultichain(
        uint256 indexed bondId,
        address indexed owner,
        address tokenContract,
        bytes32 encryptedDetails
    );

    modifier onlyCRE() {
        require(
            msg.sender == creForwarder,
            "Only CRE (Confidential Compute) allowed"
        );
        _;
    }

    constructor(address _creForwarder) {
        creForwarder = _creForwarder;
    }

    /// @notice Used post-validation of the TEE against the Off-Chain Custody Bank
    function registerMultichainBond(
        uint256 nominalValue,
        bytes32 cipherHash,
        address issuerWallet,
        address rwaToken,
        string memory network
    ) external onlyCRE returns (uint256 bondId) {
        bondId = nextBondId++;

        bonds[bondId] = BondMetadata({
            totalNominalValue: nominalValue,
            underlyingAssetAmount: nominalValue, // 1:1 initial PoR
            confidentialHash: cipherHash,
            issuerWallet: issuerWallet,
            tokenContract: rwaToken,
            isActive: true,
            chainDestination: network
        });

        emit BondMintedMultichain(bondId, issuerWallet, rwaToken, cipherHash);
    }
}
