import { FastifyInstance } from 'fastify';
import {
  getAllFranchiseAreas,
  getFranchiseAreaById,
  createFranchiseArea,
  updateFranchiseArea,
  assignFranchiseOwner,
  assignServiceAgent,
  getServiceAgents,
  uploadFranchiseDocument,
  removeIdentityProofImage,
  updateFranchiseStatus,
} from '../controllers/franchise.controller'
import {
  getAllFranchiseAreasSchema,
  getFranchiseAreaByIdSchema,
  assignFranchiseOwnerSchema,
  assignServiceAgentSchema,
  getServiceAgentsSchema,
  updateFranchiseStatusSchema,
} from '../schemas/franchise.schema';
import { UserRole } from '../types';

export default async function (fastify: FastifyInstance) {
  // Get all franchise areas
  fastify.get(
    '/',
    {
      schema: getAllFranchiseAreasSchema,
      // preHandler: [fastify.authenticate],
    },
    (request, reply) => getAllFranchiseAreas(request as any, reply as any)
  );

  // Get franchise area by ID
  fastify.get(
    '/:id',
    {
      schema: getFranchiseAreaByIdSchema,
      // preHandler: [fastify.authenticate],
    },
    (request, reply) => getFranchiseAreaById(request as any, reply as any)
  );

  // Create a new franchise area (admin only) - No schema validation for multipart
  fastify.post(
    '/',
    {
      preHandler: [fastify.authenticate, fastify.authorizeRoles([UserRole.ADMIN])],
    },
    (request,reply)=>createFranchiseArea(request as any,reply as any)
  );

  // Update franchise area (admin only) - No schema validation for multipart
  fastify.patch(
    '/:id',
    {
      preHandler: [fastify.authorizeRoles([UserRole.ADMIN])],
    },
    (request, reply) => updateFranchiseArea(request as any, reply as any)
  );

  // Upload franchise document (admin only)
  fastify.post(
    '/:id/upload/:documentType',
    {
      preHandler: [fastify.authorizeRoles([UserRole.ADMIN])],
    },
    (request, reply) => uploadFranchiseDocument(request as any, reply as any)
  );

  // Remove identity proof image (admin only)
  fastify.delete(
    '/:id/identity-proof/:imageIndex',
    {
      preHandler: [fastify.authorizeRoles([UserRole.ADMIN])],
    },
    (request, reply) => removeIdentityProofImage(request as any, reply as any)
  );

  // Assign franchise owner (admin only)
  fastify.patch(
    '/:id/assign-owner',
    {
      schema: assignFranchiseOwnerSchema,
      preHandler: [fastify.authorizeRoles([UserRole.ADMIN])],
    },
    (request, reply) => assignFranchiseOwner(request as any, reply as any)
  );

  // Assign service agent (admin or franchise owner)
  fastify.patch(
    '/:id/assign-agent',
    {
      schema: assignServiceAgentSchema,
      preHandler: [fastify.authorizeRoles([UserRole.ADMIN, UserRole.FRANCHISE_OWNER])],
    },
    (request, reply) => assignServiceAgent(request as any, reply as any)
  );

  // Get all service agents for a franchise area
  fastify.get(
    '/:id/agents',
    {
      schema: getServiceAgentsSchema,
      preHandler: [fastify.authenticate],
    },
    (request, reply) => getServiceAgents(request as any, reply as any)
  );

  // Update franchise status (admin only)
  fastify.patch(
    '/:id/status',
    {
      schema: updateFranchiseStatusSchema,
      preHandler: [fastify.authenticate, fastify.authorizeRoles([UserRole.ADMIN])],
    },
    (request, reply) => updateFranchiseStatus(request as any, reply as any)
  );

  fastify.log.info('Franchise routes registered');
} 