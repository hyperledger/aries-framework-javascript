import type { ProofRecord } from './repository'

import { scoped, Lifecycle } from 'tsyringe'

import { AgentConfig } from '../../agent/AgentConfig'

import { AutoAcceptProof } from './ProofAutoAcceptType'

/**
 * This class handles all the automation with all the messages in the present proof protocol
 * Every function returns `true` if it should automate the flow and `false` if not
 */
@scoped(Lifecycle.ContainerScoped)
export class ProofResponseCoordinator {
  private agentConfig: AgentConfig

  public constructor(agentConfig: AgentConfig) {
    this.agentConfig = agentConfig
  }

  /**
   * Returns the proof auto accept config based on priority:
   *	- The record config takes first priority
   *	- Otherwise the agent config
   *	- Otherwise {@link AutoAcceptProof.Never} is returned
   */
  private static composeAutoAccept(
    recordConfig: AutoAcceptProof | undefined,
    agentConfig: AutoAcceptProof | undefined
  ) {
    return recordConfig ?? agentConfig ?? AutoAcceptProof.Never
  }

  /**
   * Checks whether it should automatically respond to a proposal
   */
  public shouldAutoRespondToProposal(proofRecord: ProofRecord) {
    const autoAccept = ProofResponseCoordinator.composeAutoAccept(
      proofRecord.autoAcceptProof,
      this.agentConfig.autoAcceptProofs
    )

    if (autoAccept === AutoAcceptProof.Always) {
      return true
    }
    return false
  }

  /**
   * Checks whether it should automatically respond to a request
   */
  public shouldAutoRespondToRequest(proofRecord: ProofRecord) {
    const autoAccept = ProofResponseCoordinator.composeAutoAccept(
      proofRecord.autoAcceptProof,
      this.agentConfig.autoAcceptProofs
    )

    if (
      autoAccept === AutoAcceptProof.Always ||
      (autoAccept === AutoAcceptProof.ContentApproved && proofRecord.proposalMessage)
    ) {
      return true
    }

    return false
  }

  /**
   * Checks whether it should automatically respond to a presentation of proof
   */
  public shouldAutoRespondToPresentation(proofRecord: ProofRecord) {
    const autoAccept = ProofResponseCoordinator.composeAutoAccept(
      proofRecord.autoAcceptProof,
      this.agentConfig.autoAcceptProofs
    )

    if (
      autoAccept === AutoAcceptProof.Always ||
      (autoAccept === AutoAcceptProof.ContentApproved && proofRecord.requestMessage)
    ) {
      return true
    }

    return false
  }
}
