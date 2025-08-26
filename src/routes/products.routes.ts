import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  getAllProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  uploadProductImage,
  getAdminProductDetails,
} from '../controllers/products.controller';
import {
  getAllProductsSchema,
  getProductByIdSchema,
  createProductSchema,
  updateProductSchema,
  deleteProductSchema,
  uploadProductImageSchema,
  getAdminProductDetailsSchema,
} from '../schemas/products.schema';
import { UserRole } from '../types';

export default async function (fastify: FastifyInstance) {
  // Public routes - no authentication required
  fastify.get('/', { schema: getAllProductsSchema }, getAllProducts);
  fastify.get('/:id', { schema: getProductByIdSchema }, getProductById);

  // Admin only routes
  fastify.post(
    '/',{
      schema: createProductSchema,
      preHandler: [fastify.authorizeRoles([UserRole.ADMIN])],
      validatorCompiler: () => () => true
    },
    async (request, reply) => createProduct(request as any, reply as any)
  );

  fastify.put(
    '/:id',
    {
      schema: updateProductSchema,
      preHandler: [fastify.authorizeRoles([UserRole.ADMIN])],
      validatorCompiler: () => () => true
    },
    async (request,reply)=> updateProduct(request as any,reply)
  );

  fastify.delete(
    '/:id',
    {
      // schema: deleteProductSchema,
      preHandler: [fastify.authorizeRoles([UserRole.ADMIN])],
    },
    async (request:FastifyRequest,reply:FastifyReply)=>deleteProduct(request as any,reply)
  );

  // Admin product details - comprehensive information
  fastify.get(
    '/:id/admin-details',
    {
      schema: getAdminProductDetailsSchema,
      preHandler: [fastify.authenticate, fastify.authorizeRoles([UserRole.ADMIN])],
    },
    async (request, reply) => getAdminProductDetails(request as any, reply as any)
  );
 
  // Product image upload - admin only
  fastify.post(
    '/:id/images',
    {
      schema: uploadProductImageSchema,
      preHandler: [fastify.authorizeRoles([UserRole.ADMIN])],
    },
    (req,rep)=>uploadProductImage(req as any,rep)
  );

  fastify.log.info('Product routes registered');
}