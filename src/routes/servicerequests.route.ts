import { FastifyInstance } from 'fastify';
import {
  getAllServiceRequests,
  getServiceRequestById,
  createServiceRequest,
  createInstallationServiceRequest,
  updateServiceRequestStatus,
  assignServiceAgent,
  scheduleServiceRequest,
  getUnassignedServiceRequests,
  assignToMe,
} from '../controllers/serviceRequests.controller';
import {
  getAllServiceRequestsSchema,
  getServiceRequestByIdSchema,
  createInstallationServiceRequestSchema,
  updateServiceRequestStatusSchema,
  assignServiceAgentSchema,
  scheduleServiceRequestSchema,
} from '../schemas/servicerequests.schema';
import { UserRole } from '../types';
import {
  generateInstallationPaymentLink,
  refreshInstallationPaymentStatus,
} from '../controllers/serviceRequests.controller';

// Import Expo and ExpoPushMessage types
import Expo from 'expo-server-sdk';
import { ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';

// Create an Expo instance
const expo = new Expo();

export default async function (fastify: FastifyInstance) {
  // Get all service requests (admin, franchise owner, service agent, customer)
  fastify.get(
    '/',
    {
      schema: getAllServiceRequestsSchema,
      preHandler: [fastify.authenticate],
    },
    (request, reply) => getAllServiceRequests(request as any, reply as any)
  );

  // Get service request by ID
  fastify.get(
    '/:id',
    {
      // schema: getServiceRequestByIdSchema,
      preHandler: [fastify.authenticate],
    },
    (request, reply) => getServiceRequestById(request as any, reply as any)
  );

  // Create a new service request - Updated to handle form-data without orders
  fastify.post(
    '/',
    {
      schema: {
        consumes: ['multipart/form-data'],
        body: {
          type: 'object',
          required: ['productId', 'type', 'description'],
          properties: {
            productId: { type: 'string' },
            subscriptionId: { type: 'string' },
            installationRequestId: { type: 'string' },
            type: { type: 'string' },
            description: { type: 'string' },
            scheduledDate: { type: 'string' },
            requiresPayment: { type: 'boolean' },
            paymentAmount: { type: 'number' },
            images: {
              type: 'array',
              items: { type: 'string', format: 'binary' },
            },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              message: { type: 'string' },
              serviceRequest: { type: 'object' }
            }
          },
          400: {
            type: 'object',
            properties: {
              statusCode: { type: 'number' },
              error: { type: 'string' },
              message: { type: 'string' }
            }
          }
        },
        tags: ["service-requests"],
        summary: "Create a new service request",
        description: "Create a new service request for a product (rental or purchased) with optional image attachments",
        security: [{ bearerAuth: [] }],
      },
      preHandler: [fastify.authenticate],
      validatorCompiler: () => () => true // Turn off validation for form-data
    },
    (request, reply) => createServiceRequest(request as any, reply as any)
  );

  // Create installation service request (for franchise_owner/admin)
  fastify.post(
    '/installation',
    {
      schema: createInstallationServiceRequestSchema,
      preHandler: [fastify.authenticate, fastify.authorizeRoles([UserRole.ADMIN, UserRole.FRANCHISE_OWNER])],
    },
    (request, reply) => createInstallationServiceRequest(request as any, reply as any)
  );

  // Update service request status
  fastify.patch(
    '/:id/status',
    {
      // schema: updateServiceRequestStatusSchema,
      preHandler: [fastify.authenticate],
      validatorCompiler: () => () => true
    },
    (request, reply) => updateServiceRequestStatus(request as any, reply as any)
  );

  // Assign service agent
  fastify.patch(
    '/:id/assign',
    {
      schema: assignServiceAgentSchema,
      preHandler: [fastify.authenticate, fastify.authorizeRoles([UserRole.ADMIN, UserRole.FRANCHISE_OWNER])],
    },
    (request, reply) => assignServiceAgent(request as any, reply as any)
  );

  // Schedule service request
  fastify.patch(
    '/:id/scheduleDateUpdate',
    {
      schema: scheduleServiceRequestSchema,
      preHandler: [fastify.authenticate],
    },
    (request, reply) => scheduleServiceRequest(request as any, reply as any)
  );

  //   // Mark service request as started
  // fastify.put('/:id/start', {
  //   preHandler: [fastify.authenticate, fastify.authorizeRoles([UserRole.SERVICE_AGENT, UserRole.FRANCHISE_OWNER, UserRole.ADMIN])],
  // }, markAsStarted);

  // // Mark service request as completed
  // fastify.put('/:id/complete', {
  //   preHandler: [fastify.authenticate, fastify.authorizeRoles([UserRole.SERVICE_AGENT, UserRole.FRANCHISE_OWNER, UserRole.ADMIN])],
  // }, markAsCompleted);

  // Service agent specific routes for installation requests
  fastify.post('/:id/generate-payment-link', {
    preHandler: [fastify.authenticate, fastify.authorizeRoles([UserRole.SERVICE_AGENT, UserRole.FRANCHISE_OWNER, UserRole.ADMIN])],
  }, (req,res)=>generateInstallationPaymentLink(req as any,res));

  fastify.post('/:id/refresh-payment-status', {
    preHandler: [fastify.authenticate, fastify.authorizeRoles([UserRole.SERVICE_AGENT, UserRole.FRANCHISE_OWNER, UserRole.ADMIN])],
  },  (req,res)=>refreshInstallationPaymentStatus(req as any,res));

  // Get all unassigned service requests (for service agents)
  fastify.get('/unassigned', {
    preHandler: [fastify.authenticate],
    schema: getAllServiceRequestsSchema
  }, getUnassignedServiceRequests);

  // Assign service request to self
  fastify.post('/:id/assign-to-me', {
    preHandler: [fastify.authenticate],
    schema: {
      params: {
        type: 'object',
        properties: {
          id: { type: 'string' }
        },
        required: ['id']
      }
    }
  },(req,res) =>assignToMe(req as any,res));

  // fastify.post('/:id/upload-payment-proof', {
  //   preHandler: [fastify.authenticate, fastify.authorizeRoles([UserRole.SERVICE_AGENT, UserRole.FRANCHISE_OWNER, UserRole.ADMIN])],
  // }, uploadPaymentProof);

  fastify.log.info('Service Request routes registered');



}