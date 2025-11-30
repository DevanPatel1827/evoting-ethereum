// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Ethereum-based E-Voting System (Factory + Elections)
/// @notice Supports multiple elections, each with admin, phases and on-chain votes.
contract ElectionFactory {
    uint256 public electionCount;
    mapping(uint256 => address) public elections;

    event ElectionCreated(uint256 indexed electionId, address electionAddress, address admin, string title);

    function createElection(
        string memory _title,
        string memory _description,
        uint256 _registrationDuration,
        uint256 _votingDuration
    ) external returns (uint256, address) {
        // Create a new Election contract
        Election election = new Election(
            msg.sender,
            _title,
            _description,
            _registrationDuration,
            _votingDuration
        );

        electionCount += 1;
        elections[electionCount] = address(election);

        emit ElectionCreated(electionCount, address(election), msg.sender, _title);
        return (electionCount, address(election));
    }

    function getElectionAddress(uint256 _id) external view returns (address) {
        return elections[_id];
    }
}


/// @title Single Election Contract
contract Election {
    enum Phase { Created, Registration, Voting, Ended }

    struct Candidate {
        uint256 id;
        string name;
        uint256 voteCount;
    }

    address public admin;
    string public title;
    string public description;
    Phase public phase;

    uint256 public registrationStart;
    uint256 public registrationEnd;
    uint256 public votingStart;
    uint256 public votingEnd;

    uint256 public candidatesCount;
    mapping(uint256 => Candidate) public candidates;

    mapping(address => bool) public isRegisteredVoter;
    mapping(address => bool) public hasVoted;

    event PhaseChanged(Phase newPhase);
    event CandidateAdded(uint256 candidateId, string name);
    event VoterRegistered(address voter);
    event VoteCast(address voter, uint256 candidateId);
    event ElectionEnded();

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin");
        _;
    }

    modifier inPhase(Phase _phase) {
        require(phase == _phase, "Invalid phase");
        _;
    }

    constructor(
        address _admin,
        string memory _title,
        string memory _description,
        uint256 _registrationDuration,
        uint256 _votingDuration
    ) {
        admin = _admin;
        title = _title;
        description = _description;
        phase = Phase.Created;

        registrationStart = block.timestamp;
        registrationEnd = registrationStart + _registrationDuration;

        votingStart = registrationEnd;
        votingEnd = votingStart + _votingDuration;
    }

    // ====== Admin Functions ======

    function addCandidate(string memory _name) external onlyAdmin inPhase(Phase.Created) {
        require(bytes(_name).length > 0, "Name required");
        candidatesCount += 1;
        candidates[candidatesCount] = Candidate(candidatesCount, _name, 0);
        emit CandidateAdded(candidatesCount, _name);
    }

    function startRegistration() external onlyAdmin {
        require(phase == Phase.Created, "Already started");
        phase = Phase.Registration;
        emit PhaseChanged(phase);
    }

    function startVoting() external onlyAdmin {
        // Must currently be in registration phase
        require(phase == Phase.Registration, "Must be in registration");
        // 🔁 REMOVED the time requirement, so admin can move to voting whenever ready
        require(candidatesCount > 0, "No candidates");
        phase = Phase.Voting;
        emit PhaseChanged(phase);
    }

    function endElection() external onlyAdmin {
        // Must currently be in voting phase
        require(phase == Phase.Voting, "Must be in voting");
        // 🔁 REMOVED the time requirement, so admin decides when to end
        phase = Phase.Ended;
        emit PhaseChanged(phase);
        emit ElectionEnded();
    }
    // ====== Voter Management ======

    function registerVoter() external inPhase(Phase.Registration) {
        require(block.timestamp >= registrationStart && block.timestamp <= registrationEnd,
            "Registration window closed");
        require(!isRegisteredVoter[msg.sender], "Already registered");

        isRegisteredVoter[msg.sender] = true;
        emit VoterRegistered(msg.sender);
    }

    // ====== Voting ======

    function vote(uint256 _candidateId) external inPhase(Phase.Voting) {
        require(block.timestamp >= votingStart && block.timestamp <= votingEnd,
            "Voting window closed");
        require(isRegisteredVoter[msg.sender], "Not registered voter");
        require(!hasVoted[msg.sender], "Already voted");
        require(_candidateId > 0 && _candidateId <= candidatesCount, "Invalid candidate");

        hasVoted[msg.sender] = true;
        candidates[_candidateId].voteCount += 1;

        emit VoteCast(msg.sender, _candidateId);
    }

    // ====== Read Helpers ======

    function getCandidate(uint256 _id) external view returns (Candidate memory) {
        return candidates[_id];
    }

    function getAllCandidates() external view returns (Candidate[] memory) {
        Candidate[] memory list = new Candidate[](candidatesCount);
        for (uint256 i = 1; i <= candidatesCount; i++) {
            list[i - 1] = candidates[i];
        }
        return list;
    }

    function getPhase() external view returns (Phase) {
        return phase;
    }

    function getTimeWindows()
        external
        view
        returns (uint256 regStart, uint256 regEnd, uint256 votStart, uint256 votEnd)
    {
        return (registrationStart, registrationEnd, votingStart, votingEnd);
    }
}
