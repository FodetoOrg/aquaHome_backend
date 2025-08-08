import { FastifyInstance } from 'fastify';
import { UserRole } from '../types';
import { franchiseAgents, franchises } from '../models/schema';
import { eq } from 'drizzle-orm'

// Types for request/response
interface ViewAsRequest {
    Body: {
        targetUserId: string;
        targetRole: UserRole;
        franchiseId?: string;
    };
}

interface ViewAsAgentRequest {
    Body: {
        agentId: string;
        franchiseId: string;
    };
}

interface ViewAsFranchiseRequest {
    Body: {
        franchiseId: string;
    };
}

export default async function viewAsRoutes(fastify: FastifyInstance) {

    // // Enable View As - Generic endpoint
    // fastify.post<ViewAsRequest>('/enable', {
    //     preHandler: [
    //         fastify.authenticate,
    //         fastify.authorizeRoles([UserRole.ADMIN, UserRole.FRANCHISE_OWNER])
    //     ]
    // }, async (request, reply) => {
    //     try {
    //         const { targetUserId, targetRole, franchiseId } = request.body;
    //         const currentUser = request.user;

    //         // Validation: Only admins can view as anyone, franchise owners can only view as agents in their franchise
    //         if (currentUser.role === UserRole.FRANCHISE_OWNER) {
    //             if (targetRole !== UserRole.SERVICE_AGENT) {
    //                 return reply.status(403).send({
    //                     success: false,
    //                     error: 'Franchise owners can only view as service agents'
    //                 });
    //             }

    //             if (franchiseId !== currentUser.franchiseAreaId) {
    //                 return reply.status(403).send({
    //                     success: false,
    //                     error: 'You can only view as agents in your own franchise'
    //                 });
    //             }
    //         }

    //         // Verify target user exists (you should implement this based on your database)
    //         // const targetUser = await getUserById(targetUserId);
    //         // if (!targetUser) {
    //         //   return reply.status(404).send({
    //         //     success: false,
    //         //     error: 'Target user not found'
    //         //   });
    //         // }

    //         const viewAsToken = await fastify.enableViewAs(
    //             currentUser.userId,
    //             targetUserId,
    //             targetRole,
    //             franchiseId
    //         );
    //         console.log('viewAsToken ', viewAsToken)

    //         // Audit log
    //         fastify.log.info(`User ${currentUser.userId} (${currentUser.role}) started viewing as ${targetUserId} (${targetRole})`);

    //         reply.send({
    //             success: true,
    //             data: {
    //                 accessToken: viewAsToken,
    //                 viewAsContext: {
    //                     isViewingAs: true,
    //                     originalUserId: currentUser.userId,
    //                     originalRole: currentUser.role,
    //                     targetUserId,
    //                     targetRole,
    //                     franchiseId
    //                 }
    //             }
    //         });
    //     } catch (error) {
    //         fastify.log.error('Error enabling view-as:', error);
    //         reply.status(500).send({
    //             success: false,
    //             error: 'Failed to enable view-as mode'
    //         });
    //     }
    // });

    // View As Franchise Owner (Admin only)
    fastify.post<ViewAsFranchiseRequest>('/franchise-owner', {
        preHandler: [
            fastify.authenticate,
            fastify.authorizeRoles([UserRole.ADMIN])
        ]
    }, async (request, reply) => {
        try {
            const { franchiseId } = request.body;
            const currentUser = request.user;

            // Get franchise details (implement based on your database)
            const franchise = await fastify.db.query.franchises.findFirst({
                where: eq(franchises.id, franchiseId),
                with: {
                    owner: true
                }
            })
            if (!franchise) {
                return reply.status(404).send({
                    success: false,
                    error: 'Franchise not found'
                });
            }
            console.log('here came')

            const viewAsToken = await fastify.enableViewAs(
                currentUser.userId,
                franchise.owner.id, // Virtual user ID for franchise
                UserRole.FRANCHISE_OWNER,
                franchiseId
            );

            console.log('viewAsToken ', viewAsToken)

            fastify.log.info(`Admin ${currentUser.userId} started viewing as franchise owner for franchise ${franchiseId}`);

            reply.send({
                success: true,
                data: {
                    accessToken: viewAsToken,
                    viewAsContext: {
                        isViewingAs: true,
                        originalUserId: currentUser.userId,
                        originalRole: currentUser.role,
                        targetRole: UserRole.FRANCHISE_OWNER,
                        franchiseId,
                        // franchiseName: franchise.name
                    }
                }
            });
        } catch (error) {
            console.log('Error viewing as franchise owner:', error);
            reply.status(500).send({
                success: false,
                error: 'Failed to view as franchise owner'
            });
        }
    });

    // View As Service Agent
    fastify.post<ViewAsAgentRequest>('/service-agent', {
        preHandler: [
            fastify.authenticate,
            fastify.authorizeRoles([UserRole.ADMIN, UserRole.FRANCHISE_OWNER])
        ]
    }, async (request, reply) => {
        try {
            const { agentId, franchiseId } = request.body;
            const currentUser = request.user;

            console.log('agentId ', agentId)


            console.log('cam in vas ', currentUser)
            // Validation for franchise owners
            if (currentUser.role === UserRole.FRANCHISE_OWNER) {
                const frnachise = await fastify.db.query.franchises.findFirst({
                    where: eq(franchises.ownerId, currentUser.userId)
                })
                if (!frnachise) {
                    return reply.status(403).send({
                        success: false,
                        error: 'You can only view as agents in your own franchise'
                    });
                }

            }


            const agent = await fastify.db.query.franchiseAgents.findFirst({
                where: eq(franchiseAgents.agentId, agentId)
            })
            if (!agent) {
                return reply.status(403).send({
                    success: false,
                    error: 'You can only view as agents in your own franchise'
                });
            }

            // Verify agent exists and belongs to the franchise
            // const agent = await getServiceAgentById(agentId);
            // if (!agent || agent.franchiseId !== franchiseId) {
            //   return reply.status(404).send({
            //     success: false,
            //     error: 'Service agent not found or not in specified franchise'
            //   });
            // }

            const viewAsToken = await fastify.enableViewAs(
                currentUser.userId,
                agentId,
                UserRole.SERVICE_AGENT,
                franchiseId
            );

            fastify.log.info(`User ${currentUser.userId} (${currentUser.role}) started viewing as service agent ${agentId}`);

            reply.send({
                success: true,
                data: {
                    accessToken: viewAsToken,
                    viewAsContext: {
                        isViewingAs: true,
                        originalUserId: currentUser.userId,
                        originalRole: currentUser.role,
                        targetUserId: agentId,
                        targetRole: UserRole.SERVICE_AGENT,
                        franchiseId,
                        // agentName: agent.name
                    }
                }
            });
        } catch (error) {
            fastify.log.error('Error viewing as service agent:', error);
            reply.status(500).send({
                success: false,
                error: 'Failed to view as service agent'
            });
        }
    });

    // Exit View As
    fastify.post('/exit', {
        preHandler: [fastify.authenticate]
    }, async (request, reply) => {
        try {
            const currentUser = request.user;

            if (!currentUser.isViewingAs) {
                return reply.status(400).send({
                    success: false,
                    error: 'Not currently in view-as mode'
                });
            }

            const normalToken = await fastify.exitViewAs(currentUser.originalUserId || currentUser.userId);

            fastify.log.info(`User ${currentUser.originalUserId} exited view-as mode`);

            reply.send({
                success: true,
                data: {
                    accessToken: normalToken,
                    message: 'Successfully exited view-as mode'
                }
            });
        } catch (error) {
            fastify.log.error('Error exiting view-as:', error);
            reply.status(500).send({
                success: false,
                error: 'Failed to exit view-as mode'
            });
        }
    });

    // Get current view-as status
    fastify.get('/status', {
        preHandler: [fastify.authenticate]
    }, async (request, reply) => {
        const currentUser = request.user;

        reply.send({
            success: true,
            data: {
                isViewingAs: currentUser.isViewingAs || false,
                originalUserId: currentUser.originalUserId,
                originalRole: currentUser.originalRole,
                currentRole: currentUser.role,
                targetUserId: currentUser.viewAsTargetId,
                franchiseId: currentUser.franchiseAreaId
            }
        });
    });



    fastify.log.info('View As routes registered');
}